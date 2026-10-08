import pg from "pg";

const { Client } = pg;

const requiredTables = [
  "project_contracts",
  "project_contacts",
  "opportunities",
  "opportunity_contacts",
  "opportunity_status_history",
  "workflow_executions",
] as const;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to verify the database schema");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const tableResult = await client.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])`,
      [requiredTables],
    );
    const foundTables = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = requiredTables.filter((table) => !foundTables.has(table));

    const columnResult = await client.query<{ column_name: string; is_nullable: "YES" | "NO" }>(
      `select column_name, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'workflow_executions'
          and column_name = any($1::text[])`,
      [["project_id", "opportunity_id"]],
    );
    const columns = new Map(columnResult.rows.map((row) => [row.column_name, row.is_nullable]));
    const columnErrors: string[] = [];
    const targetColumn = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='target_project_id'",
    );
    if (!targetColumn.rows.length) columnErrors.push("opportunities.target_project_id is missing");

    for (const column of ["project_id", "opportunity_id"]) {
      if (!columns.has(column)) {
        columnErrors.push(`workflow_executions.${column} is missing`);
      } else if (columns.get(column) !== "YES") {
        columnErrors.push(`workflow_executions.${column} must be nullable`);
      }
    }

    if (missingTables.length || columnErrors.length) {
      const details = [
        missingTables.length ? `missing tables: ${missingTables.join(", ")}` : "",
        ...columnErrors,
      ].filter(Boolean);
      throw new Error(`Database schema verification failed: ${details.join("; ")}`);
    }

    console.log("Database schema verified.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});