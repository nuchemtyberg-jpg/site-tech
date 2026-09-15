import { db } from "./db";
import { sql } from "drizzle-orm";
import { SCOPE_CATEGORY_SEEDS } from "../shared/scopeChecklist";

/**
 * Tracked, one-time data migrations. Runs at server startup (all environments)
 * and from the post-merge script, so production deploys apply data backfills
 * automatically after the schema is pushed.
 *
 * Each migration runs exactly once per database. All migration writes and the
 * applied-key record happen in ONE transaction under an advisory lock, so a
 * failure rolls back both the writes and the key — partial output can never
 * survive without its tracking key, and failed runs remain retryable.
 */

/** Minimal executor shared by `db` and a drizzle transaction. */
export type MigrationExecutor = Pick<typeof db, "execute">;

export type DataMigration = { key: string; run: (tx: MigrationExecutor) => Promise<void> };

const MIGRATIONS: DataMigration[] = [
  {
    key: "2026-08-10-customer-company-contacts-backfill",
    run: (tx) => backfillCustomerContacts(tx),
  },
  {
    key: "2026-08-10-remove-fabricated-no-company-contacts",
    run: (tx) => removeFabricatedNoCompanyContacts(tx),
  },
  {
    key: "2026-08-10-create-contacts-for-no-company-customers",
    run: (tx) => createContactsForNoCompanyCustomers(tx),
  },
  {
    key: "2026-09-08-seed-scope-checklist-catalog",
    run: (tx) => seedScopeChecklistCatalog(tx),
  },
  {
    key: "2026-09-08-seed-scope-checklist-catalog-v2",
    run: (tx) => seedScopeChecklistCatalog(tx),
  },
  {
    key: "2026-09-08-seed-scope-checklist-catalog-v3",
    run: (tx) => seedScopeChecklistCatalog(tx),
  },
  {
    key: "2026-09-15-migrate-pre-award-projects-to-opportunities",
    run: (tx) => migratePreAwardProjectsToOpportunities(tx),
  },
  {
    key: "2026-09-15-backfill-unassigned-customer-for-orphaned-pre-award-projects",
    run: (tx) => backfillUnassignedCustomerForOrphanedPreAwardProjects(tx),
  },
];

/**
 * Pre-award Project -> Opportunity mapping (spec: "Move pre-award Projects
 * into Opportunities"). Historical `bid_lost`/`new`/etc. project rows map to
 * the closest equivalent point in the Opportunity pipeline.
 */
const PRE_AWARD_PROJECT_STATUS_MAP: Record<string, string> = {
  new: "new",
  bidding: "estimating",
  takeoff_done: "estimating",
  takeoff_reviewed: "proposal_ready",
  proposal_sent: "proposal_sent",
  bid_lost: "lost",
};
const PRE_AWARD_PROJECT_STATUSES = Object.keys(PRE_AWARD_PROJECT_STATUS_MAP);

/**
 * Moves every non-deleted Project whose status is still pre-award (`new`,
 * `bidding`, `takeoff_done`, `takeoff_reviewed`, `proposal_sent`, `bid_lost`)
 * into the Opportunities table: creates a matching Opportunity (customer,
 * name, address, scope/notes, expected value, mapped status), copies the
 * project's contacts into `opportunity_contacts`, re-points the project's
 * todos and files to the new Opportunity via their polymorphic
 * relatedEntityType/relatedEntityId link, records an initial status-history
 * row noting the migration origin, and soft-deletes the Project.
 *
 * Idempotent by construction: once a Project is migrated it is soft-deleted,
 * so `deleted_at IS NULL` in the selection below excludes it on a re-run —
 * no separate "already migrated" tracking is needed. Projects with no
 * customer are skipped (opportunities.customer_id is NOT NULL) and left as
 * Projects; this is logged so it can be resolved manually.
 */
export async function migratePreAwardProjectsToOpportunities(tx: MigrationExecutor): Promise<void> {
  const candidates = await tx.execute(sql`
    SELECT id, project_number, customer_id, name, street_address, city, state, zip,
           description, notes, estimated_value, status
    FROM projects
    WHERE deleted_at IS NULL
      AND status IN (${sql.raw(PRE_AWARD_PROJECT_STATUSES.map((s) => `'${s}'`).join(","))})
    ORDER BY id
  `);

  const skippedNoCustomer: number[] = [];

  for (const row of candidates.rows as any[]) {
    if (row.customer_id === null || row.customer_id === undefined) {
      skippedNoCustomer.push(row.id);
      continue;
    }

    const mappedStatus = PRE_AWARD_PROJECT_STATUS_MAP[row.status as string];

    // Allocate the next OPP-YYYY-NNNN number. Safe without a separate
    // advisory lock: this whole migration already runs inside the single
    // data-migrations transaction serialized by the pg_advisory_xact_lock
    // taken in runDataMigrations, so no concurrent inserter can race it.
    const year = new Date().getFullYear();
    const prefix = `OPP-${year}-`;
    const [{ maxseq }] = (
      await tx.execute(sql`
        SELECT coalesce(max((substring(opportunity_number from ${sql.raw(String(prefix.length + 1))}::int))::int), 0) AS maxseq
        FROM opportunities
        WHERE opportunity_number LIKE ${prefix + "%"}
      `)
    ).rows as any[];
    const opportunityNumber = `${prefix}${String(Number(maxseq) + 1).padStart(4, "0")}`;

    const [{ id: opportunityId }] = (
      await tx.execute(sql`
        INSERT INTO opportunities (
          opportunity_number, name, customer_id, status,
          street_address, city, state, zip,
          scope_summary, internal_notes, expected_value,
          migrated_from_project_id, migrated_from_project_number,
          created_at, updated_at
        )
        VALUES (
          ${opportunityNumber}, ${row.name}, ${row.customer_id}, ${mappedStatus},
          ${row.street_address}, ${row.city}, ${row.state}, ${row.zip},
          ${row.description}, ${row.notes}, ${row.estimated_value},
          ${row.id}, ${row.project_number},
          now(), now()
        )
        RETURNING id
      `)
    ).rows as any[];

    // Copy the project's contacts into opportunity_contacts (role left unset —
    // project_contacts uses a free-text roleLabel, opportunity roles are a
    // distinct fixed enum, so there is no lossless mapping).
    await tx.execute(sql`
      INSERT INTO opportunity_contacts (opportunity_id, contact_id, is_primary, created_at)
      SELECT ${opportunityId}, pc.contact_id, false, now()
      FROM project_contacts pc
      WHERE pc.project_id = ${row.id}
      ON CONFLICT (opportunity_id, contact_id) DO NOTHING
    `);

    // Initial status history entry, so the bidding pipeline shows accurate history.
    await tx.execute(sql`
      INSERT INTO opportunity_status_history (opportunity_id, previous_status, new_status, changed_by_user_id, changed_by_name, changed_at)
      VALUES (${opportunityId}, NULL, ${mappedStatus}, NULL, ${"System (migrated from Project " + (row.project_number || `#${row.id}`) + ")"}, now())
    `);

    // Re-point todos and files via their polymorphic related-entity link;
    // clear projectId so they stop showing under the (soon soft-deleted) Project.
    await tx.execute(sql`
      UPDATE todos
      SET related_entity_type = 'opportunity', related_entity_id = ${opportunityId}, project_id = NULL, updated_at = now()
      WHERE deleted_at IS NULL
        AND (project_id = ${row.id} OR (related_entity_type = 'project' AND related_entity_id = ${row.id}))
    `);
    await tx.execute(sql`
      UPDATE files
      SET related_entity_type = 'opportunity', related_entity_id = ${opportunityId}, project_id = NULL
      WHERE deleted_at IS NULL
        AND (project_id = ${row.id} OR (related_entity_type = 'project' AND related_entity_id = ${row.id}))
    `);

    // Soft-delete the migrated Project last, once everything else succeeded.
    await tx.execute(sql`UPDATE projects SET deleted_at = now() WHERE id = ${row.id}`);
  }

  if (skippedNoCustomer.length > 0) {
    console.warn(
      `[data-migrations] migrate-pre-award-projects-to-opportunities: skipped ${skippedNoCustomer.length} ` +
        `pre-award project(s) with no customer (cannot create an Opportunity without a customer): ` +
        `ids ${skippedNoCustomer.join(", ")}. Assign a customer and re-run to migrate them.`,
    );
  }
}

/**
 * Product decision (2026-09-15, user-accepted): the pre-award projects that
 * migratePreAwardProjectsToOpportunities skips for having no customer are all
 * pre-existing stale/orphaned rows (auto-generated test-fixture names and
 * emails, blank description/notes/address). Rather than leaving them stuck in
 * the Projects tab forever or inventing a real customer identity for them,
 * they are backfilled onto a single shared placeholder "Unassigned Customer"
 * (created here if missing) so they satisfy opportunities.customer_id NOT
 * NULL and can proceed through the normal migration. Then immediately
 * re-invokes migratePreAwardProjectsToOpportunities on the same transaction
 * so the now-fixed rows are picked up in this same run.
 *
 * This is a one-time backfill for existing orphaned rows: it does not change
 * how NEW pre-award projects are created, so future customer-less projects
 * still require a real customer assigned via the UI before they migrate
 * (the primary, intended path) instead of silently defaulting to the
 * placeholder.
 */
export async function backfillUnassignedCustomerForOrphanedPreAwardProjects(
  tx: MigrationExecutor,
): Promise<void> {
  const orphaned = await tx.execute(sql`
    SELECT id FROM projects
    WHERE deleted_at IS NULL
      AND customer_id IS NULL
      AND status IN (${sql.raw(PRE_AWARD_PROJECT_STATUSES.map((s) => `'${s}'`).join(","))})
  `);
  if (orphaned.rows.length === 0) return;

  const existing = (
    await tx.execute(sql`SELECT id FROM customers WHERE name = 'Unassigned Customer' AND deleted_at IS NULL`)
  ).rows as any[];

  let placeholderCustomerId: number;
  if (existing.length > 0) {
    placeholderCustomerId = existing[0].id;
  } else {
    const [{ id }] = (
      await tx.execute(sql`
        INSERT INTO customers (name, status, notes, created_at, updated_at)
        VALUES (
          'Unassigned Customer', 'active',
          'Placeholder customer for pre-award Projects that had no customer on file when migrated to Opportunities. Replace with the real customer when known.',
          now(), now()
        )
        RETURNING id
      `)
    ).rows as any[];
    placeholderCustomerId = id;
  }

  const ids = (orphaned.rows as any[]).map((r) => r.id);
  await tx.execute(sql`
    UPDATE projects SET customer_id = ${placeholderCustomerId}
    WHERE id IN (${sql.raw(ids.join(","))})
  `);
  console.log(
    `[data-migrations] backfilled placeholder "Unassigned Customer" (id ${placeholderCustomerId}) onto ` +
      `${ids.length} orphaned pre-award project(s) with no customer: ids ${ids.join(", ")}`,
  );

  // Immediately re-run the migration on this same transaction so the
  // now-fixed rows move to Opportunities within this same migration run.
  await migratePreAwardProjectsToOpportunities(tx);
}

/**
 * Customer Company & Contacts upgrade backfill. Converts legacy person-centric
 * customer rows (person in `name`, organization in legacy `company`) into the
 * Company + Contacts model:
 * - A Primary Contact is derived from the legacy name/email/phone ONLY when the
 *   legacy `name` unambiguously represents a person: the row has a nonblank
 *   `company`, a nonblank `name` different from that company, and no contacts
 *   yet. Rows without a legacy company are ambiguous (the name could itself be
 *   a company), so NO contact is invented for them — contacts are optional in
 *   the new model.
 * - The legacy `company` value is then promoted to the customer (company) name.
 * - Rows without a company keep their existing name and are flagged
 *   `name_needs_review` for manual cleanup (we don't invent a company or a
 *   contact).
 * Requires the schema push (contacts table + new customers columns) first.
 *
 * Statements run on the caller-provided executor: the migration runner passes
 * its own transaction so writes commit atomically with the tracking key. Also
 * exported with an optional customer-id scope so tests can exercise it against
 * representative temp rows without touching the rest of the table.
 */
export async function backfillCustomerContacts(
  tx: MigrationExecutor,
  onlyCustomerIds?: number[],
): Promise<void> {
  const scope = (alias: string) =>
    onlyCustomerIds && onlyCustomerIds.length > 0
      ? sql` AND ${sql.raw(alias)}.id IN (${sql.raw(onlyCustomerIds.map((id) => Number(id)).join(","))})`
      : sql``;

  // 1. Derive a Primary Contact only from person-style legacy rows.
  await tx.execute(sql`
    INSERT INTO contacts (customer_id, first_name, last_name, email, office_phone, is_primary, is_active, roles)
    SELECT c.id,
           split_part(btrim(c.name), ' ', 1),
           NULLIF(btrim(substr(btrim(c.name), length(split_part(btrim(c.name), ' ', 1)) + 2)), ''),
           NULLIF(btrim(c.email), ''),
           NULLIF(btrim(c.phone), ''),
           true, true, '{}'::text[]
    FROM customers c
    WHERE btrim(coalesce(c.name, '')) <> ''
      AND btrim(coalesce(c.company, '')) <> ''
      AND lower(btrim(c.name)) <> lower(btrim(c.company))
      AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.customer_id = c.id)${scope("c")}
  `);

  // 2. Promote the legacy company to the customer (company) name.
  await tx.execute(sql`
    UPDATE customers c
    SET name = company, updated_at = now()
    WHERE company IS NOT NULL AND btrim(company) <> '' AND name IS DISTINCT FROM company${scope("c")}
  `);

  // 3. No company to promote: keep the person name but flag it for cleanup.
  await tx.execute(sql`
    UPDATE customers c
    SET name_needs_review = true
    WHERE (company IS NULL OR btrim(company) = '')
      AND btrim(coalesce(name, '')) <> ''
      AND name_needs_review IS DISTINCT FROM true${scope("c")}
  `);
}

/**
 * Corrective migration: an earlier version of the backfill invented a primary
 * contact from `name` even when the name did not unambiguously represent a
 * person (no legacy company, or name identical to the company). Removes
 * exactly those fabricated contacts: the customer is such an ambiguous row and
 * the contact is an untouched auto-derivation of the customer's own name/
 * email/phone with no history. User-created or edited contacts are never
 * removed; the source email/phone still live on the customer row.
 */
export async function removeFabricatedNoCompanyContacts(
  tx: MigrationExecutor,
  onlyCustomerIds?: number[],
): Promise<void> {
  const scope =
    onlyCustomerIds && onlyCustomerIds.length > 0
      ? sql` AND c.id IN (${sql.raw(onlyCustomerIds.map((id) => Number(id)).join(","))})`
      : sql``;

  await tx.execute(sql`
    DELETE FROM contacts ct
    USING customers c
    WHERE ct.customer_id = c.id
      AND (btrim(coalesce(c.company, '')) = ''
           OR lower(btrim(c.name)) = lower(btrim(c.company)))
      AND btrim(ct.first_name || coalesce(' ' || ct.last_name, '')) = btrim(c.name)
      AND coalesce(lower(btrim(ct.email)), '') = coalesce(lower(NULLIF(btrim(c.email), '')), '')
      AND coalesce(btrim(ct.office_phone), '') = coalesce(btrim(coalesce(NULLIF(btrim(c.phone), ''), '')), '')
      AND ct.mobile_phone IS NULL AND ct.job_title IS NULL AND ct.notes IS NULL
      AND coalesce(array_length(ct.roles, 1), 0) = 0
      AND NOT EXISTS (SELECT 1 FROM communications m WHERE m.contact_id = ct.id)${scope}
  `);
}

/**
 * Product decision (2026-08-10, user-accepted): legacy customers WITHOUT a
 * company should still get a Primary Contact derived from their person
 * name/email/phone, per the literal spec — even though the name is ambiguous.
 * The customer stays flagged `name_needs_review` so the record can be cleaned
 * up manually (and the bogus contact removed by hand if the name turns out to
 * be a company). This supersedes the earlier conservative behavior enforced by
 * `removeFabricatedNoCompanyContacts`; running third, it restores those
 * contacts everywhere.
 *
 * Only touches flagged rows that still have NO contacts at all, so it never
 * duplicates or demotes anything user-created, and re-running is a no-op.
 */
export async function createContactsForNoCompanyCustomers(
  tx: MigrationExecutor,
  onlyCustomerIds?: number[],
): Promise<void> {
  const scope =
    onlyCustomerIds && onlyCustomerIds.length > 0
      ? sql` AND c.id IN (${sql.raw(onlyCustomerIds.map((id) => Number(id)).join(","))})`
      : sql``;

  await tx.execute(sql`
    INSERT INTO contacts (customer_id, first_name, last_name, email, office_phone, is_primary, is_active, roles)
    SELECT c.id,
           split_part(btrim(c.name), ' ', 1),
           NULLIF(btrim(substr(btrim(c.name), length(split_part(btrim(c.name), ' ', 1)) + 2)), ''),
           NULLIF(btrim(c.email), ''),
           NULLIF(btrim(c.phone), ''),
           true, true, '{}'::text[]
    FROM customers c
    WHERE c.name_needs_review = true
      AND c.deleted_at IS NULL
      AND btrim(coalesce(c.name, '')) <> ''
      AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.customer_id = c.id)${scope}
  `);
}

/**
 * Seeds the Scope Checklist category/template catalog from the maintainable
 * source in shared/scopeChecklist.ts. Uses ON CONFLICT on the stable `key`
 * columns so it is safe to re-run after the seed list gains new items later
 * (existing rows are left untouched; only missing keys are inserted).
 */
export async function seedScopeChecklistCatalog(tx: MigrationExecutor): Promise<void> {
  for (const category of SCOPE_CATEGORY_SEEDS) {
    await tx.execute(sql`
      INSERT INTO scope_categories (key, name, display_order)
      VALUES (${category.key}, ${category.name}, ${category.displayOrder})
      ON CONFLICT (key) DO NOTHING
    `);
    for (const item of category.items) {
      await tx.execute(sql`
        INSERT INTO scope_item_templates (category_id, key, name, description, display_order, is_active)
        SELECT sc.id, ${item.key}, ${item.name}, ${item.description ?? null}, ${item.displayOrder}, true
        FROM scope_categories sc WHERE sc.key = ${category.key}
        ON CONFLICT (key) DO NOTHING
      `);
    }
  }
}

/**
 * Applies any unapplied migrations. `migrations` is overridable only so tests
 * can inject failing migrations; production callers use the default list.
 */
export async function runDataMigrations(migrations: DataMigration[] = MIGRATIONS): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS data_migrations (
      key text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `);

  // One transaction per run: a transaction-scoped advisory lock serializes
  // concurrent runners (server startup + post-merge script may overlap during
  // a deploy), and every migration body runs on THIS transaction, so its
  // writes commit or roll back together with the tracking-key insert.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('data_migrations'))`);

    for (const migration of migrations) {
      const applied = await tx.execute(sql`SELECT 1 FROM data_migrations WHERE key = ${migration.key}`);
      if (applied.rows.length > 0) continue;

      console.log(`[data-migrations] applying ${migration.key}...`);
      try {
        await migration.run(tx);
      } catch (err) {
        console.error(
          `[data-migrations] FAILED applying ${migration.key}. ` +
            `Ensure the schema has been pushed (npm run db:push) before starting the server.`,
        );
        throw err;
      }
      await tx.execute(sql`INSERT INTO data_migrations (key) VALUES (${migration.key})`);
      console.log(`[data-migrations] applied ${migration.key}`);
    }
  });
}
