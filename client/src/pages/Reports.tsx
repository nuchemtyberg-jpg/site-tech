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

const SUGGESTED_QUESTIONS = [
  "How many tasks did I complete this week and what is the total value?",
  "What is the total value of all completed tasks this month?",
  "Show me unbilled completed tasks grouped by project",
  "Which projects have the highest estimated value?",
  "How many active projects do we have right now?",
  "Show daily reports filed in the last 7 days by project",
  "What equipment is currently in use?",
  "Top 5 customers by total project value",
  "Total labor hours per project this month",
  "Tasks overdue (past due date and not completed)",
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

          {!result && !queryMutation.isPending && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Try one of these
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Badge
                    key={q}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary/20 transition-colors py-1.5 px-3 font-normal"
                    onClick={() => handleSubmit(q)}
                    data-testid={`suggestion-${q.slice(0, 20)}`}
                  >
                    {q}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
