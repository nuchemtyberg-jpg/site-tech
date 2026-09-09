/**
 * Authenticated HTTP verification for configurable document categories.
 * Creates temporary users, sessions, and a category, then cleans them up.
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { documentCategories, files } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5000";
const ADMIN_ID = "__document-categories-admin";
const MEMBER_ID = "__document-categories-member";
const PENDING_ADMIN_ID = "__document-categories-pending-admin";

let failures = 0;
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 500));
  }
}

function cookie(sid: string) {
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
  return `connect.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
}

async function addSession(userId: string, email: string) {
  const sid = crypto.randomBytes(16).toString("hex");
  const session = {
    cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: userId, email }, expires_at: Math.floor(Date.now() / 1000) + 3600, access_token: "test", refresh_token: "test" } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(session)}::jsonb, NOW() + interval '1 hour')`);
  return { sid, headers: { Cookie: cookie(sid), "Content-Type": "application/json" } };
}

async function json(response: Response) {
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  const emailAdmin = "__document-categories-admin@test.local";
  const emailMember = "__document-categories-member@test.local";
  const emailPendingAdmin = "__document-categories-pending-admin@test.local";
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_authorized)
    VALUES (${ADMIN_ID}, ${emailAdmin}, 'Category', 'Admin', 'admin', 'approved'),
           (${MEMBER_ID}, ${emailMember}, 'Category', 'Member', 'user', 'approved'),
           (${PENDING_ADMIN_ID}, ${emailPendingAdmin}, 'Category', 'Pending Admin', 'admin', 'pending')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_authorized = 'approved'`);
  await db.execute(sql`UPDATE users SET is_authorized = 'pending' WHERE id = ${PENDING_ADMIN_ID}`);
  const admin = await addSession(ADMIN_ID, emailAdmin);
  const member = await addSession(MEMBER_ID, emailMember);
  const pendingAdmin = await addSession(PENDING_ADMIN_ID, emailPendingAdmin);
  let createdId: number | null = null;
  let originalOrder: Array<{ id: number; displayOrder: number }> = [];

  try {
    const initial = await json(await fetch(`${BASE}/api/document-categories`, { headers: admin.headers }));
    check("authorized user can list seeded categories", initial.status === 200 && initial.body?.length >= 12, initial);
    originalOrder = (initial.body ?? []).map((category: any) => ({ id: category.id, displayOrder: category.displayOrder }));

    const memberList = await json(await fetch(`${BASE}/api/document-categories`, { headers: member.headers }));
    check("approved member can list categories", memberList.status === 200, memberList);

    const create = await json(await fetch(`${BASE}/api/document-categories`, {
      method: "POST", headers: admin.headers, body: JSON.stringify({ name: "__Temporary Trade Documents" }),
    }));
    createdId = create.body?.id ?? null;
    check("admin can add category with stable generated key", create.status === 201 && create.body?.key === "temporary_trade_documents" && create.body?.isActive === true, create);
    await db.insert(files).values([
      {
        name: "__Category usage v1",
        objectPath: "__test/category-usage-v1",
        relatedEntityType: "opportunity",
        relatedEntityId: 1,
        category: create.body.key,
        documentVersion: 1,
        documentStatus: "superseded",
      },
      {
        name: "__Category usage v2",
        objectPath: "__test/category-usage-v2",
        relatedEntityType: "opportunity",
        relatedEntityId: 1,
        category: create.body.key,
        documentVersion: 2,
        documentStatus: "current",
      },
    ]);
    const withUsage = await json(await fetch(`${BASE}/api/document-categories`, { headers: admin.headers }));
    check("usage count includes current and historical versions", withUsage.body?.find((category: any) => category.id === createdId)?.documentUsageCount === 2, withUsage);

    const memberCreate = await fetch(`${BASE}/api/document-categories`, {
      method: "POST", headers: member.headers, body: JSON.stringify({ name: "Forbidden" }),
    });
    check("non-admin cannot add categories", memberCreate.status === 403, memberCreate.status);

    const rename = await json(await fetch(`${BASE}/api/document-categories/${createdId}`, {
      method: "PATCH", headers: admin.headers, body: JSON.stringify({ name: "__Renamed Trade Documents" }),
    }));
    check("admin can rename without changing key", rename.status === 200 && rename.body?.name === "__Renamed Trade Documents" && rename.body?.key === create.body?.key, rename);

    const deactivate = await json(await fetch(`${BASE}/api/document-categories/${createdId}`, {
      method: "PATCH", headers: admin.headers, body: JSON.stringify({ isActive: false }),
    }));
    check("admin can deactivate category", deactivate.status === 200 && deactivate.body?.isActive === false, deactivate);

    const memberUpdate = await fetch(`${BASE}/api/document-categories/${createdId}`, {
      method: "PATCH", headers: member.headers, body: JSON.stringify({ isActive: true }),
    });
    check("non-admin cannot change categories", memberUpdate.status === 403, memberUpdate.status);
    const pendingCreate = await fetch(`${BASE}/api/document-categories`, {
      method: "POST", headers: pendingAdmin.headers, body: JSON.stringify({ name: "Forbidden Pending Admin" }),
    });
    check("unapproved admin cannot add categories", pendingCreate.status === 403, pendingCreate.status);
    const pendingUpdate = await fetch(`${BASE}/api/document-categories/${createdId}`, {
      method: "PATCH", headers: pendingAdmin.headers, body: JSON.stringify({ isActive: true }),
    });
    check("unapproved admin cannot change categories", pendingUpdate.status === 403, pendingUpdate.status);

    const allIds = [...(initial.body ?? []).map((category: any) => category.id), createdId!];
    const reordered = await fetch(`${BASE}/api/document-categories/reorder`, {
      method: "PUT", headers: admin.headers, body: JSON.stringify({ orderedIds: [createdId, ...allIds.filter(id => id !== createdId)] }),
    });
    check("admin can reorder all categories", reordered.status === 204, reordered.status);
    const afterReorder = await json(await fetch(`${BASE}/api/document-categories`, { headers: admin.headers }));
    check("reordered category is first", afterReorder.body?.[0]?.id === createdId, afterReorder.body?.slice(0, 2));
    const pendingReorder = await fetch(`${BASE}/api/document-categories/reorder`, {
      method: "PUT", headers: pendingAdmin.headers, body: JSON.stringify({ orderedIds: allIds }),
    });
    check("unapproved admin cannot reorder categories", pendingReorder.status === 403, pendingReorder.status);

    const incomplete = await fetch(`${BASE}/api/document-categories/reorder`, {
      method: "PUT", headers: admin.headers, body: JSON.stringify({ orderedIds: [createdId] }),
    });
    check("incomplete reorder is rejected", incomplete.status === 400, incomplete.status);
    const emptyUpdate = await fetch(`${BASE}/api/document-categories/${createdId}`, {
      method: "PATCH", headers: admin.headers, body: JSON.stringify({}),
    });
    check("empty category update is rejected", emptyUpdate.status === 400, emptyUpdate.status);
    const malformedId = await fetch(`${BASE}/api/document-categories/not-a-number`, {
      method: "PATCH", headers: admin.headers, body: JSON.stringify({ name: "Nope" }),
    });
    check("malformed category ID is rejected", malformedId.status === 400, malformedId.status);

    const unauthenticated = await fetch(`${BASE}/api/document-categories`);
    check("unauthenticated list is rejected", unauthenticated.status === 401, unauthenticated.status);

    console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  } finally {
    await db.delete(files).where(sql`${files.objectPath} LIKE '__test/category-usage-%'`);
    for (const category of originalOrder) {
      await db.update(documentCategories).set({ displayOrder: category.displayOrder }).where(eq(documentCategories.id, category.id));
    }
    if (createdId) await db.delete(documentCategories).where(eq(documentCategories.id, createdId));
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${admin.sid} OR sid = ${member.sid} OR sid = ${pendingAdmin.sid}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${ADMIN_ID} OR id = ${MEMBER_ID} OR id = ${PENDING_ADMIN_ID}`);
  }

  if (failures) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});