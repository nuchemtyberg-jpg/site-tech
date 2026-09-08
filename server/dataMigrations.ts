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
];

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
