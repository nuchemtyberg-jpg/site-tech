import OpenAI from "openai";
import { pool } from "../db";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SCHEMA_DESCRIPTION = `
You are a SQL analyst for SiteTech, a sitework/construction management platform.
The database is PostgreSQL. Today's date is CURRENT_DATE.

IMPORTANT GUIDELINES:
- Generate ONLY a single SELECT query. Never write INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, etc.
- Always exclude soft-deleted rows: add "deleted_at IS NULL" for tables that have a deleted_at column.
- Always add an explicit LIMIT (default 500) unless the user asks for a single aggregate.
- Format dollar amounts as plain integers (the database stores cents/integers; treat as dollars).
- Use ISO date arithmetic with CURRENT_DATE, INTERVAL, date_trunc.
- Prefer descriptive column aliases (snake_case or Title Case) so the result reads well as a report.
- When the user asks about "this week", use date_trunc('week', CURRENT_DATE) for Monday-start weeks.
- When the user asks about "this month/year", use date_trunc accordingly.
- When joining tables, always qualify columns.
- If the question is ambiguous, make a reasonable assumption and add a note in the explanation.

KEY TABLES (columns shown are the most useful ones):

projects (id, project_number, customer_id, name, status, estimated_value, start_date, end_date, color, created_at, deleted_at)
  status values: new, bidding, takeoff_done, takeoff_reviewed, proposal_sent, active, completed, bid_lost, archive

customers (id, name, company, email, phone, created_at, deleted_at)

tasks (id, project_id, title, status, percent_complete, scheduled_value, scheduled_date, due_date,
       estimated_hours, assigned_to, completed_at, billed_at, billed_by, created_at, deleted_at)
  status values: pending, scheduled, in_progress, completed, blocked
  percent_complete: 0-100. A task is "completed" when status='completed' OR percent_complete=100.
  scheduled_value: dollar amount for G702 schedule of values.
  completed_at: timestamp when the task was marked complete.
  billed_at: timestamp when the task was marked as billed.

task_status_history (id, task_id, previous_status, new_status, previous_percent_complete, new_percent_complete,
                     changed_by_user_id, changed_by_name, changed_at, source, daily_report_id)

equipment (id, name, type, make, model, year, serial_number, status, current_location, created_at, deleted_at)
  status values: available, in_use, maintenance, repair, out_of_service

maintenance_logs (id, equipment_id, type, description, performed_at, cost, deleted_at)

daily_reports (id, project_id, report_date, weather_summary, temperature, status, signature_value,
               completed_at, created_at, deleted_at)
  status values: draft, completed

daily_report_task_entries (id, daily_report_id, task_id, hours_worked, notes, created_at, deleted_at)
daily_report_labor_lines (id, daily_report_id, employee_id, role, hours, notes, deleted_at)
daily_report_equipment_lines (id, daily_report_id, equipment_id, hours, notes, deleted_at)
daily_report_inspection_entries (id, daily_report_id, inspection_type, authority, inspector_name, status, notes)
daily_report_delivery_entries (id, daily_report_id, supplier, material, quantity, unit, notes)

schedule_entries (id, task_id, project_id, start_date, duration, include_sunday, notes, created_by, deleted_at)
allocations (id, schedule_entry_id, employee_id, equipment_id, deleted_at)

fingercheck_employees (id, employee_number, first_name, last_name, email, position, status, deleted_at)
fingercheck_time_punches (id, employee_id, project_id, punch_in, punch_out, hours_worked, status)

pay_applications (id, project_id, application_number, period_to, contract_date, retainage_percent, status, deleted_at)
pay_application_items (id, pay_application_id, task_id, scheduled_value, previously_completed,
                       this_periods_work, materials_stored)

rfis (id, project_id, subject, question, status, created_at, deleted_at)
  status: draft, open, responded, closed

photos (id, project_id, album_id, media_type, url, taken_at, created_at, deleted_at)
files (id, project_id, folder_id, name, mime_type, url, created_at, deleted_at)

users (id, email, first_name, last_name, role, is_approved, created_at)

OUTPUT FORMAT (strict JSON):
{
  "sql": "SELECT ... FROM ... ;",
  "explanation": "One short sentence describing what the query returns.",
  "chart": "table" | "bar" | "line" | "pie" | "kpi",
  "x_column": "column_name_for_x_axis_if_chart" or null,
  "y_column": "column_name_for_y_axis_if_chart" or null,
  "title": "Short report title"
}

Pick "kpi" if the result is a single numeric scalar (e.g. one row, one value).
Pick "bar" or "line" for grouped/time-series data.
Pick "pie" for category breakdowns with small cardinality.
Otherwise pick "table".
`;

export interface ReportPlan {
  sql: string;
  explanation: string;
  chart: "table" | "bar" | "line" | "pie" | "kpi";
  x_column: string | null;
  y_column: string | null;
  title: string;
}

export interface ReportResult extends ReportPlan {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
}

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|comment|merge|call|do)\b/i;

function validateSql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/g, "");
  if (!/^\s*(select|with)\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are allowed.");
  }
  if (trimmed.includes(";")) {
    throw new Error("Only a single statement is allowed.");
  }
  if (FORBIDDEN.test(trimmed)) {
    throw new Error("Query contains forbidden keywords.");
  }
  return trimmed;
}

export async function planReport(question: string): Promise<ReportPlan> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: SCHEMA_DESCRIPTION },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as ReportPlan;
  if (!parsed.sql) throw new Error("AI did not return a SQL query.");
  parsed.sql = validateSql(parsed.sql);
  parsed.chart = (parsed.chart || "table") as ReportPlan["chart"];
  parsed.title = parsed.title || "Report";
  parsed.explanation = parsed.explanation || "";
  return parsed;
}

export async function runReportSql(sql: string): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query(sql);
    await client.query("ROLLBACK");
    const columns = result.fields.map((f) => f.name);
    return { rows: result.rows, columns };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function generateReport(question: string): Promise<ReportResult> {
  const plan = await planReport(question);
  const { rows, columns } = await runReportSql(plan.sql);
  return { ...plan, rows, columns, rowCount: rows.length };
}
