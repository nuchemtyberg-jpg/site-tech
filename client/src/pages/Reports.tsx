import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart3,
  Loader2,
  Send,
  Sparkles,
  Code2,
  ChevronDown,
  Download,
  AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

interface ReportResult {
  sql: string;
  explanation: string;
  chart: "table" | "bar" | "line" | "pie" | "kpi";
  x_column: string | null;
  y_column: string | null;
  title: string;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
}

interface Template {
  label: string;
  question: string;
}

interface TemplateCategory {
  name: string;
  templates: Template[];
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    name: "Financial / Billing",
    templates: [
      { label: "Unbilled completed work", question: "List every task that is 100% complete or status 'completed' and has not been marked billed (billed_at IS NULL), grouped by project, with total scheduled value per project and the count of unbilled tasks." },
      { label: "Revenue this month", question: "Total scheduled value of tasks completed (status='completed' or percent_complete=100) where completed_at is in the current month, grouped by project." },
      { label: "Revenue this quarter", question: "Total scheduled value of tasks completed (status='completed' or percent_complete=100) where completed_at falls in the current calendar quarter, grouped by project." },
      { label: "Revenue year-to-date", question: "Total scheduled value of tasks completed (status='completed' or percent_complete=100) where completed_at is in the current year, grouped by month." },
      { label: "Outstanding receivables", question: "List all pay applications with status='submitted' (not yet approved), showing project name, application number, period_to date, and total this period's work plus materials stored." },
      { label: "Retainage held by project", question: "For each project with active or completed pay applications, show project name, retainage_percent, and cumulative retainage held (sum of (this_periods_work + materials_stored) * retainage_percent / 100 across all pay_application_items)." },
      { label: "Profitability snapshot", question: "For each active project, show estimated_value, total scheduled_value of all tasks, total estimated_hours of all tasks, and total actual labor hours from fingercheck_time_punches." },
    ],
  },
  {
    name: "Operations / Productivity",
    templates: [
      { label: "Tasks completed this week", question: "How many tasks were completed this week (completed_at >= date_trunc('week', CURRENT_DATE)) and what is the total scheduled value? Show one KPI." },
      { label: "Overdue tasks", question: "List all tasks where due_date < CURRENT_DATE and status is not 'completed' and percent_complete < 100, grouped by project and assigned_to, showing task title, due_date, days overdue, and assignee." },
      { label: "Aging tasks (30/60/90)", question: "Bucket all open tasks (status not 'completed' and percent_complete < 100) by age since created_at: 0-30 days, 31-60 days, 61-90 days, 90+ days. Show count and total scheduled_value per bucket." },
      { label: "Schedule slip", question: "For tasks completed in the last 90 days, compare scheduled_date to completed_at. Show task title, project, scheduled_date, completed_at, and days_difference (positive = late, negative = early). Sort by largest slip." },
    ],
  },
  {
    name: "Labor (Fingercheck)",
    templates: [
      { label: "Labor hours by employee this week", question: "Total hours_worked from fingercheck_time_punches this week (punch_in >= date_trunc('week', CURRENT_DATE)), grouped by employee first_name and last_name. Sort by hours descending." },
      { label: "Labor hours by project this month", question: "Total hours_worked from fingercheck_time_punches in the current month, grouped by project name. Sort by hours descending." },
      { label: "Estimated vs actual hours", question: "For each active project, show total estimated_hours from tasks and total actual hours_worked from fingercheck_time_punches, and the variance." },
      { label: "Job transfers today", question: "Find employees who had time punches on more than one project on the same day in the last 7 days. Show employee name, date, and the projects they transferred between." },
      { label: "Daily report participation gaps", question: "For the last 14 days, find employee/project/date combinations where fingercheck_time_punches exist but no daily_report_labor_lines exist for that employee on that project's daily report for that date." },
    ],
  },
  {
    name: "Equipment",
    templates: [
      { label: "Equipment utilization this month", question: "For each piece of equipment, count distinct days in the current month where it appears in daily_report_equipment_lines (joined via daily_reports.report_date). Show equipment name, type, days used, and utilization percentage out of working days in the month." },
      { label: "Idle equipment", question: "List equipment with status='available' that is not referenced in any allocations linked to schedule_entries with start_date in the next 14 days. Show equipment name, type, and current_location." },
      { label: "Maintenance due / overdue", question: "For each piece of equipment, show the most recent maintenance_log performed_at date, days since last maintenance, and flag equipment with no maintenance in the last 90 days as overdue." },
      { label: "Maintenance spend YTD", question: "Total cost from maintenance_logs in the current year, grouped by equipment name, sorted by total cost descending." },
    ],
  },
  {
    name: "Project Pipeline / Sales",
    templates: [
      { label: "Bid pipeline value", question: "Sum of estimated_value for projects in status 'bidding', 'takeoff_done', 'takeoff_reviewed', or 'proposal_sent', grouped by status. Show as a bar chart." },
      { label: "Win rate this year", question: "For projects created in the current year, count how many are in 'completed' or 'active' status (won) vs 'bid_lost' (lost), and compute win rate percentage." },
      { label: "Top customers by value", question: "Top 10 customers by total estimated_value across all their projects. Show customer name, company, project count, and total value." },
    ],
  },
  {
    name: "Field / Compliance",
    templates: [
      { label: "Daily reports filed vs expected", question: "For each active project, count daily_reports filed in the last 7 days vs the expected 5 (Mon-Fri). Show project name, reports filed, expected, and missing days count. Flag projects with fewer than expected." },
      { label: "Inspections summary", question: "Count daily_report_inspection_entries in the last 30 days, grouped by inspection_type, authority, and status (pass/fail). Show as a table." },
      { label: "Deliveries this week", question: "List daily_report_delivery_entries from the last 7 days, showing supplier, material, total quantity, unit, and which projects they were delivered to." },
      { label: "Photo / document activity", question: "Count photos and files uploaded per project in the last 7 days, grouped by project name. Show photo count, file count, and total uploads." },
    ],
  },
];


const PIE_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === "string") {
    // ISO date detection
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00").toLocaleDateString();
    return v;
  }
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function downloadCsv(rows: Record<string, unknown>[], columns: string[], filename: string) {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => escape(r[c])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ChartView({ result }: { result: ReportResult }) {
  const { chart, rows, columns, x_column, y_column } = result;

  if (chart === "kpi" && rows.length > 0) {
    const firstRow = rows[0];
    const entries = Object.entries(firstRow);
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {entries.map(([key, value]) => (
          <Card key={key} data-testid={`kpi-card-${key}`}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{key.replace(/_/g, " ")}</p>
              <p className="text-3xl font-bold mt-2">{formatValue(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if ((chart === "bar" || chart === "line") && rows.length > 0) {
    const xKey = x_column || columns[0];
    const yKey = y_column || columns[1];
    const Chart = chart === "bar" ? BarChart : LineChart;
    return (
      <div className="h-80 w-full" data-testid="chart-view">
        <ResponsiveContainer>
          <Chart data={rows as any[]}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} className="text-xs" />
            <YAxis className="text-xs" />
            <RechartsTooltip />
            <Legend />
            {chart === "bar" ? (
              <Bar dataKey={yKey} fill="#f59e0b" />
            ) : (
              <Line type="monotone" dataKey={yKey} stroke="#f59e0b" strokeWidth={2} />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart === "pie" && rows.length > 0) {
    const xKey = x_column || columns[0];
    const yKey = y_column || columns[1];
    return (
      <div className="h-80 w-full" data-testid="chart-pie">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={rows as any[]}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {rows.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Table fallback
  return (
    <div className="rounded-lg border overflow-x-auto" data-testid="table-results">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c.replace(/_/g, " ")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                No results
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => (
              <TableRow key={idx} data-testid={`row-result-${idx}`}>
                {columns.map((c) => (
                  <TableCell key={c} className="whitespace-nowrap">
                    {formatValue(row[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Reports() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/reports/query", { question: q });
      return (await res.json()) as ReportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err: Error) => {
      const msg = err.message.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(msg);
        setError(parsed.error || msg);
      } catch {
        setError(msg);
      }
      setResult(null);
    },
  });

  const handleSubmit = (q?: string) => {
    const finalQ = (q ?? question).trim();
    if (!finalQ) {
      toast({ title: "Enter a question", description: "Type what you'd like to know.", variant: "destructive" });
      return;
    }
    setQuestion(finalQ);
    queryMutation.mutate(finalQ);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Reports</h1>
            <p className="text-sm text-muted-foreground">
              Ask questions about your data in plain English
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Ask a question
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder='e.g. "How many tasks did I complete this week and what is their total value?"'
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={3}
            className="resize-none"
            data-testid="input-question"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Tip: press <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Cmd/Ctrl + Enter</kbd> to run
            </p>
            <Button
              onClick={() => handleSubmit()}
              disabled={queryMutation.isPending}
              data-testid="button-run-report"
            >
              {queryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Run report
                </>
              )}
            </Button>
          </div>

        </CardContent>
      </Card>

      {!queryMutation.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Report templates
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Click any template to run it instantly
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {TEMPLATE_CATEGORIES.map((category) => (
              <div key={category.name}>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  {category.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {category.templates.map((tmpl) => (
                    <Badge
                      key={tmpl.label}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary/20 transition-colors py-1.5 px-3 font-normal"
                      onClick={() => handleSubmit(tmpl.question)}
                      title={tmpl.question}
                      data-testid={`template-${tmpl.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      {tmpl.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Couldn't run that report</p>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-error">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Try rephrasing your question or being more specific about what data you want.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle data-testid="text-report-title">{result.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.explanation}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {result.rowCount} {result.rowCount === 1 ? "row" : "rows"} returned
                </p>
              </div>
              {result.rows.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv(result.rows, result.columns, `${result.title.replace(/\s+/g, "_")}.csv`)}
                  data-testid="button-download-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ChartView result={result} />

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-toggle-sql">
                  <Code2 className="w-4 h-4 mr-2" />
                  Show generated SQL
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="bg-muted text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
                  {result.sql}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
