/**
 * Authenticated HTTP verification for Task 27 (Scope & Pricing Checklist).
 * Forges a session like scripts/test-http-api.ts. Self-cleaning.
 * Run: npx tsx scripts/test-opportunity-scope-api.ts
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5000";
const USER_ID = "mobile-user-001"; // admin, approved
const MEMBER_ID = "__scope-catalog-member";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.error(`  FAIL ${label}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 400) : ""); }
}

function makeCookie(sid: string): string {
  const secret = process.env.SESSION_SECRET!;
  const sig = crypto.createHmac("sha256", secret).update(sid).digest("base64").replace(/=+$/, "");
  return `connect.sid=${encodeURIComponent(`s:${sid}.${sig}`)}`;
}

async function main() {
  const sid = crypto.randomBytes(16).toString("hex");
  const expiresAtSec = Math.floor(Date.now() / 1000) + 6 * 3600;
  const sess = {
    cookie: { originalMaxAge: 604800000, expires: new Date(Date.now() + 6 * 3600_000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: USER_ID, email: "admin@test.com" }, expires_at: expiresAtSec, access_token: "test", refresh_token: "test" } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::jsonb, NOW() + interval '6 hours')`);
  const H = { Cookie: makeCookie(sid), "Content-Type": "application/json" };
  const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

  let custId: number | null = null;
  let oppId: number | null = null;
  let secondOppId: number | null = null;
  let catalogCategoryId: number | null = null;
  let catalogItemId: number | null = null;
  let secondCatalogItemId: number | null = null;
  const memberSid = crypto.randomBytes(16).toString("hex");
  const memberEmail = "__scope-catalog-member@test.local";
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_authorized)
    VALUES (${MEMBER_ID}, ${memberEmail}, 'Scope', 'Member', 'user', 'approved')
    ON CONFLICT (id) DO UPDATE SET role = 'user', is_authorized = 'approved'`);
  const memberSession = {
    ...sess,
    passport: { user: { ...sess.passport.user, claims: { ...sess.passport.user.claims, sub: MEMBER_ID, email: memberEmail } } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${memberSid}, ${JSON.stringify(memberSession)}::jsonb, NOW() + interval '6 hours')`);
  const MEMBER_H = { Cookie: makeCookie(memberSid), "Content-Type": "application/json" };

  try {
    console.log("== Admin scope catalog authorization and maintenance ==");
    const adminCatalog = await j(await fetch(`${BASE}/api/admin/scope-catalog`, { headers: H }));
    check("admin can list complete catalog", adminCatalog.status === 200 && Array.isArray(adminCatalog.body?.items), adminCatalog);
    const memberCatalog = await j(await fetch(`${BASE}/api/admin/scope-catalog`, { headers: MEMBER_H }));
    check("non-admin cannot list scope catalog", memberCatalog.status === 403, memberCatalog);
    const newCategory = await j(await fetch(`${BASE}/api/admin/scope-catalog/categories`, {
      method: "POST", headers: H, body: JSON.stringify({ name: "__SCOPE Temporary Category" }),
    }));
    catalogCategoryId = newCategory.body?.id;
    check("admin can create scope category", newCategory.status === 201 && newCategory.body?.isActive === true, newCategory);
    const newTemplate = await j(await fetch(`${BASE}/api/admin/scope-catalog/items`, {
      method: "POST", headers: H, body: JSON.stringify({ categoryId: catalogCategoryId, name: "__SCOPE Temporary Template" }),
    }));
    catalogItemId = newTemplate.body?.id;
    check("admin can create scope item template", newTemplate.status === 201 && newTemplate.body?.isActive === true, newTemplate);
    const secondTemplate = await j(await fetch(`${BASE}/api/admin/scope-catalog/items`, {
      method: "POST", headers: H, body: JSON.stringify({ categoryId: catalogCategoryId, name: "__SCOPE Second Temporary Template" }),
    }));
    secondCatalogItemId = secondTemplate.body?.id;
    check("second configured item is created", secondTemplate.status === 201, secondTemplate);
    const orderedCatalog = await j(await fetch(`${BASE}/api/admin/scope-catalog`, { headers: H }));
    check("catalog categories use configured display order", orderedCatalog.body.categories.every((category: any, index: number, all: any[]) => index === 0 || all[index - 1].displayOrder <= category.displayOrder), orderedCatalog.body.categories);
    const configuredItems = orderedCatalog.body.items.filter((item: any) => item.categoryId === catalogCategoryId);
    check("catalog items use configured display order", configuredItems.map((item: any) => item.id).join(",") === `${catalogItemId},${secondCatalogItemId}`, configuredItems);
    const memberWrite = await j(await fetch(`${BASE}/api/admin/scope-catalog/items`, {
      method: "POST", headers: MEMBER_H, body: JSON.stringify({ categoryId: catalogCategoryId, name: "Forbidden" }),
    }));
    check("non-admin cannot create catalog items", memberWrite.status === 403, memberWrite);
    const memberUpdate = await j(await fetch(`${BASE}/api/admin/scope-catalog/categories/${catalogCategoryId}`, {
      method: "PATCH", headers: MEMBER_H, body: JSON.stringify({ name: "Forbidden" }),
    }));
    check("non-admin cannot update catalog categories", memberUpdate.status === 403, memberUpdate);
    const memberCategoryReorder = await fetch(`${BASE}/api/admin/scope-catalog/categories/reorder`, {
      method: "PUT", headers: MEMBER_H, body: JSON.stringify({ orderedIds: orderedCatalog.body.categories.map((category: any) => category.id) }),
    });
    check("non-admin cannot reorder catalog categories", memberCategoryReorder.status === 403, memberCategoryReorder.status);
    const memberItemReorder = await fetch(`${BASE}/api/admin/scope-catalog/categories/${catalogCategoryId}/items/reorder`, {
      method: "PUT", headers: MEMBER_H, body: JSON.stringify({ orderedIds: [catalogItemId, secondCatalogItemId] }),
    });
    check("non-admin cannot reorder catalog items", memberItemReorder.status === 403, memberItemReorder.status);

    console.log("== Setup ==");
    const cust = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__SCOPE Test Customer" }) }));
    custId = cust.body?.id;
    check("setup customer", cust.status === 201, cust);

    const opp = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "__SCOPE Test Bid", customerId: custId, status: "new" }) }));
    oppId = opp.body?.id;
    check("setup opportunity", opp.status === 201, opp);

    console.log("== Automatic catalog preload ==");
    const empty = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("scope list returns 200", empty.status === 200, empty);
    check("new opportunity automatically receives active catalog items", empty.body?.items?.length > 0, empty.body);
    check("new opportunity includes newly active catalog template", empty.body?.items?.some((item: any) => item.templateId === catalogItemId), empty.body);
    const firstIndex = empty.body.items.findIndex((item: any) => item.templateId === catalogItemId);
    const secondIndex = empty.body.items.findIndex((item: any) => item.templateId === secondCatalogItemId);
    check("preloaded items follow configured category/item order", firstIndex >= 0 && secondIndex === firstIndex + 1, [firstIndex, secondIndex]);
    check("preloaded readiness is not_started", empty.body?.readiness === "not_started", empty.body);
    check("categories are returned with the checklist", empty.body?.categories?.length >= 1, empty.body?.categories);

    console.log("== One-off custom item ==");
    const earlyCustom = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { method: "POST", headers: H, body: JSON.stringify({ categoryKey: "paving", name: "__SCOPE early custom item" }) }));
    check("custom item creatable before any template is applied", earlyCustom.status === 201, earlyCustom);
    const earlyList = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("early custom item appears under its category with categoryKey", earlyList.body.items.some((i: any) => i.id === earlyCustom.body.id && i.categoryKey === "paving"));
    const delEarly = await fetch(`${BASE}/api/opportunities/${oppId}/scope/${earlyCustom.body.id}`, { method: "DELETE", headers: H });
    check("early custom item removable", delEarly.status === 204, delEarly.status);

    console.log("== Duplicate-safe preload ==");
    const applied = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/apply-template`, { method: "POST", headers: H, body: "{}" }));
    check("apply-template 200", applied.status === 200, applied);
    check("automatic preload already inserted items", applied.body?.items?.length > 0, applied.body?.items?.length);
    check("manual duplicate-safe application inserts nothing", applied.body?.addedCount === 0, applied.body?.addedCount);
    const totalTemplateItems = applied.body.items.length;

    const reapplied = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/apply-template`, { method: "POST", headers: H, body: "{}" }));
    check("re-apply is idempotent (no duplicates)", reapplied.body?.items?.length === totalTemplateItems, [reapplied.body?.items?.length, totalTemplateItems]);

    console.log("== Custom item (name + optional master description, separate from notes) ==");
    const custom = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { method: "POST", headers: H, body: JSON.stringify({ categoryKey: "other", name: "__SCOPE custom widget removal", description: "__SCOPE master description detail" }) }));
    check("create custom item 201", custom.status === 201, custom);
    check("custom item flagged isCustom", custom.body?.isCustom === true, custom.body);
    check("custom item stores name", custom.body?.name === "__SCOPE custom widget removal", custom.body);
    check("custom item stores master description separately", custom.body?.description === "__SCOPE master description detail", custom.body);
    const customId = custom.body?.id;

    const badCustom = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { method: "POST", headers: H, body: JSON.stringify({ categoryKey: "other", name: "" }) }));
    check("empty name rejected 400", badCustom.status === 400, badCustom);

    console.log("== Status transitions & readiness ==");
    const list1 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("readiness is in_progress with 0 reviewed of many? -> still not_started", list1.body?.readiness === "not_started", list1.body?.readiness);
    const allItems: any[] = list1.body.items;

    // Mark every item included/excluded except one -> needs_clarification
    for (let i = 0; i < allItems.length - 1; i++) {
      const status = i % 2 === 0 ? "included" : "excluded";
      await fetch(`${BASE}/api/opportunities/${oppId}/scope/${allItems[i].id}`, { method: "PUT", headers: H, body: JSON.stringify({ status }) });
    }
    const midList = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("readiness is in_progress mid-review", midList.body?.readiness === "in_progress", midList.body?.readiness);

    const lastId = allItems[allItems.length - 1].id;
    const clarify = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/${lastId}`, { method: "PUT", headers: H, body: JSON.stringify({ status: "needs_clarification" }) }));
    check("mark needs_clarification 200", clarify.status === 200, clarify);

    const clarifyList = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("readiness stays in_progress with open clarification", clarifyList.body?.readiness === "in_progress", clarifyList.body?.readiness);
    check("summary counts needs_clarification = 1", clarifyList.body.items.filter((i: any) => i.status === "needs_clarification").length === 1);

    console.log("== Notes are separate from name/description ==");
    const notesUpdate = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/${lastId}`, { method: "PUT", headers: H, body: JSON.stringify({ notes: "__SCOPE opportunity-specific note" }) }));
    check("notes update 200", notesUpdate.status === 200, notesUpdate);
    check("name unchanged by notes update", notesUpdate.body?.name === allItems[allItems.length - 1].name, notesUpdate.body);
    check("notes stored separately", notesUpdate.body?.notes === "__SCOPE opportunity-specific note", notesUpdate.body);

    console.log("== Master description can be edited independently of notes ==");
    const descUpdate = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/${lastId}`, { method: "PUT", headers: H, body: JSON.stringify({ description: "__SCOPE updated master description" }) }));
    check("description update 200", descUpdate.status === 200, descUpdate);
    check("description updated", descUpdate.body?.description === "__SCOPE updated master description", descUpdate.body);
    check("notes unaffected by description update", descUpdate.body?.notes === "__SCOPE opportunity-specific note", descUpdate.body);

    console.log("== Create clarification Todo ==");
    const todoRes = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/${lastId}/todo`, { method: "POST", headers: H, body: JSON.stringify({ assignedToUserId: USER_ID }) }));
    check("clarification todo created 201", todoRes.status === 201, todoRes);
    check("todo linked to opportunity", todoRes.body?.relatedEntityType === "opportunity" && todoRes.body?.relatedEntityId === oppId, todoRes.body);

    const afterTodo = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    const clarifiedItem = afterTodo.body.items.find((i: any) => i.id === lastId);
    check("scope item stores linkedTodoId", clarifiedItem?.linkedTodoId === todoRes.body?.id, clarifiedItem);

    console.log("== Resolve last item -> ready_for_takeoff ==");
    await fetch(`${BASE}/api/opportunities/${oppId}/scope/${lastId}`, { method: "PUT", headers: H, body: JSON.stringify({ status: "included" }) });
    const readyList = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("readiness is ready_for_takeoff when fully reviewed", readyList.body?.readiness === "ready_for_takeoff", readyList.body?.readiness);

    console.log("== Reorder (exact persisted order within a category) ==");
    const sitework = readyList.body.items.filter((i: any) => i.categoryKey === "sitework");
    check("sitework category has at least 2 items to reorder", sitework.length >= 2, sitework.length);
    const siteworkIds = sitework.map((i: any) => i.id);
    const reversedSitework = [...siteworkIds].reverse();
    const reorderRes = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/reorder`, { method: "POST", headers: H, body: JSON.stringify({ orderedIds: reversedSitework }) }));
    check("reorder 200", reorderRes.status === 200, reorderRes);
    const afterReorder = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    const siteworkAfter = afterReorder.body.items.filter((i: any) => i.categoryKey === "sitework").map((i: any) => i.id);
    check("reorder persisted the exact new order", JSON.stringify(siteworkAfter) === JSON.stringify(reversedSitework), [siteworkAfter, reversedSitework]);

    console.log("== Delete a custom item ==");
    const del = await fetch(`${BASE}/api/opportunities/${oppId}/scope/${customId}`, { method: "DELETE", headers: H });
    check("delete custom item 204", del.status === 204, del.status);
    const afterDelete = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("custom item actually removed", !afterDelete.body.items.some((i: any) => i.id === customId));

    console.log("== Delete a predefined (template-applied) item ==");
    const templateItem = afterDelete.body.items.find((i: any) => !i.isCustom && i.templateId !== catalogItemId);
    check("a template-applied item exists to test removal", Boolean(templateItem));
    const delTemplate = await fetch(`${BASE}/api/opportunities/${oppId}/scope/${templateItem.id}`, { method: "DELETE", headers: H });
    check("predefined item is removable too (user can freely remove pre-populated items)", delTemplate.status === 204, delTemplate.status);
    const afterTemplateDelete = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("predefined item actually removed", !afterTemplateDelete.body.items.some((i: any) => i.id === templateItem.id));

    console.log("== 404s for unknown opportunity ==");
    const notFound = await j(await fetch(`${BASE}/api/opportunities/999999999/scope`, { headers: H }));
    check("unknown opportunity 404", notFound.status === 404, notFound);

    console.log("== Removed predefined items are never resurrected by re-applying the template ==");
    const beforeReapply = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    const totalBeforeReapply = beforeReapply.body.items.length;
    const reapplyAfterRemoval = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope/apply-template`, { method: "POST", headers: H, body: "{}" }));
    check("apply-template reports addedCount", typeof reapplyAfterRemoval.body?.addedCount === "number", reapplyAfterRemoval.body);
    check("re-applying after removal adds nothing (removed predefined item is not resurrected)", reapplyAfterRemoval.body.addedCount === 0, reapplyAfterRemoval.body.addedCount);
    check("removed predefined item still absent by templateId", !reapplyAfterRemoval.body.items.some((i: any) => i.id === templateItem.id));
    const afterReapply = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("total item count unchanged after no-op re-apply", afterReapply.body.items.length === totalBeforeReapply, [afterReapply.body.items.length, totalBeforeReapply]);
    check("apply-template response also returns categories (consistent contract with list)", reapplyAfterRemoval.body?.categories?.length >= 1, reapplyAfterRemoval.body?.categories);

    console.log("== Catalog deactivation preserves history and affects only future Opportunities ==");
    const deactivateTemplate = await j(await fetch(`${BASE}/api/admin/scope-catalog/items/${catalogItemId}`, {
      method: "PATCH", headers: H, body: JSON.stringify({ isActive: false }),
    }));
    check("admin can deactivate a catalog item", deactivateTemplate.status === 200 && deactivateTemplate.body?.isActive === false, deactivateTemplate);
    const historical = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("deactivated template remains on existing opportunity", historical.body?.items?.some((item: any) => item.templateId === catalogItemId), historical.body);
    const deactivateCategory = await j(await fetch(`${BASE}/api/admin/scope-catalog/categories/${catalogCategoryId}`, {
      method: "PATCH", headers: H, body: JSON.stringify({ isActive: false }),
    }));
    check("admin can deactivate a scope category", deactivateCategory.status === 200 && deactivateCategory.body?.isActive === false, deactivateCategory);
    const historicalAfterCategory = await j(await fetch(`${BASE}/api/opportunities/${oppId}/scope`, { headers: H }));
    check("category deactivation preserves all historical category items", historicalAfterCategory.body?.items?.some((item: any) => item.templateId === secondCatalogItemId), historicalAfterCategory.body);
    const second = await j(await fetch(`${BASE}/api/opportunities`, {
      method: "POST", headers: H, body: JSON.stringify({ name: "__SCOPE Future Bid", customerId: custId, status: "new" }),
    }));
    check("future opportunity create succeeds", second.status === 201, second);
    secondOppId = second.body?.id;
    const secondScope = await j(await fetch(`${BASE}/api/opportunities/${secondOppId}/scope`, { headers: H }));
    check("future opportunity scope list succeeds", secondScope.status === 200, secondScope);
    check("inactive catalog item is not preloaded into future opportunity", !secondScope.body?.items?.some((item: any) => item.templateId === catalogItemId), secondScope.body);
    check("active item in inactive category is also not preloaded", !secondScope.body?.items?.some((item: any) => item.templateId === secondCatalogItemId), secondScope.body);

    console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  } finally {
    console.log("Cleaning up temp data...");
    if (oppId) {
      await db.execute(sql`DELETE FROM opportunity_scope_items WHERE opportunity_id = ${oppId}`);
      await db.execute(sql`DELETE FROM todos WHERE related_entity_type = 'opportunity' AND related_entity_id = ${oppId}`);
      await db.execute(sql`DELETE FROM activity_logs WHERE metadata->>'opportunityId' = ${String(oppId)}`);
      await db.execute(sql`DELETE FROM opportunities WHERE id = ${oppId}`);
    }
    if (secondOppId) {
      await db.execute(sql`DELETE FROM opportunity_scope_items WHERE opportunity_id = ${secondOppId}`);
      await db.execute(sql`DELETE FROM activity_logs WHERE metadata->>'opportunityId' = ${String(secondOppId)}`);
      await db.execute(sql`DELETE FROM opportunities WHERE id = ${secondOppId}`);
    }
    if (catalogItemId) await db.execute(sql`DELETE FROM scope_item_templates WHERE id = ${catalogItemId}`);
    if (secondCatalogItemId) await db.execute(sql`DELETE FROM scope_item_templates WHERE id = ${secondCatalogItemId}`);
    if (catalogCategoryId) await db.execute(sql`DELETE FROM scope_categories WHERE id = ${catalogCategoryId}`);
    if (custId) await db.execute(sql`DELETE FROM customers WHERE id = ${custId}`);
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${memberSid}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${MEMBER_ID}`);
    console.log("Cleanup done.");
  }

  if (failures > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
