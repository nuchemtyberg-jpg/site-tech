import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, Archive, ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, Columns3, List, Plus, Search, Target, UserRoundX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OpportunityFormDialog } from "@/components/OpportunityFormDialog";
import { OpportunityStatusDialog } from "@/pages/OpportunityDetails";
import { useOpportunities, type OpportunityListFilters } from "@/hooks/use-opportunities";
import { localToday } from "@/hooks/use-todos";
import { cn } from "@/lib/utils";
import {
  getOpportunityDeadlineUrgency, getOpportunityStatusColor, getOpportunityStatusLabel,
  OPPORTUNITY_ACTIVE_STATUSES, OPPORTUNITY_ACTIVE_STATUS_SET, OPPORTUNITY_DEADLINE_ELIGIBLE_STATUS_SET,
  OPPORTUNITY_OUTCOME_STATUSES, OPPORTUNITY_PROJECT_TYPES, OPPORTUNITY_SOURCES,
  OPPORTUNITY_STATUSES,
} from "@shared/opportunityStatus";
import type { OpportunityWithDetails } from "@shared/schema";
import type { Customer } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AwardCatchUpPanel } from "@/components/opportunities/AwardCatchUpPanel";

const ACTIVE = OPPORTUNITY_STATUSES.filter(s => OPPORTUNITY_ACTIVE_STATUS_SET.has(s.value));
const ACTIVE_STATUS_PARAM = OPPORTUNITY_ACTIVE_STATUSES.join(",");
const ALL_STATUS_PARAM = OPPORTUNITY_STATUSES.map(s => s.value).join(",");
type View = "pipeline" | "list";

function dueState(opportunity: OpportunityWithDetails) {
  if (!OPPORTUNITY_DEADLINE_ELIGIBLE_STATUS_SET.has(opportunity.status)) return null;
  switch (getOpportunityDeadlineUrgency(opportunity.bidDueDate, localToday())) {
    case "overdue": return { label: "Overdue", className: "text-destructive bg-destructive/10" };
    case "today": return { label: "Due today", className: "text-orange-700 dark:text-orange-300 bg-orange-500/10" };
    case "tomorrow": return { label: "Due tomorrow", className: "text-amber-700 dark:text-amber-300 bg-amber-500/10" };
    case "this_week":
    case "next_7_days": return { label: "Due this week", className: "text-amber-700 dark:text-amber-300 bg-amber-500/10" };
  }
  return null;
}

function BidCard({ opportunity, compact = false, canViewValues = false, backQuery = "" }: { opportunity: OpportunityWithDetails; compact?: boolean; canViewValues?: boolean; backQuery?: string }) {
  const urgency = dueState(opportunity);
  const [statusOpen, setStatusOpen] = useState(false);
  return (
    <>
      <Card className={cn("hover:border-primary/50 transition-colors min-w-0", opportunity.isArchived && "opacity-65")}>
        <CardContent className={cn("p-4 space-y-2", compact && "p-3")}>
          <Link href={`/bidding/${opportunity.id}${backQuery ? `?from=${encodeURIComponent(backQuery)}` : ""}`} className="block min-w-0">
          <div className="flex justify-between gap-2 min-w-0"><span className="font-semibold text-sm break-words">{opportunity.name}</span>{canViewValues && opportunity.expectedValue != null && <span className="text-xs font-medium shrink-0">${opportunity.expectedValue.toLocaleString()}</span>}</div>
          <p className="text-xs text-muted-foreground truncate">{opportunity.opportunityNumber} · {opportunity.customerName || "Unknown customer"}</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            {!compact && <Badge variant="secondary">{getOpportunityStatusLabel(opportunity.status)}</Badge>}
            {urgency && <Badge variant="outline" className={urgency.className}><AlertCircle className="w-3 h-3 mr-1" />{urgency.label}</Badge>}
            {!opportunity.responsibleUserId && <Badge variant="outline"><UserRoundX className="w-3 h-3 mr-1" />Unassigned</Badge>}
            {opportunity.isArchived && <Badge variant="outline">Archived</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{opportunity.bidDueDate ? `Bid due ${opportunity.bidDueDate}${opportunity.bidDueTime ? ` at ${opportunity.bidDueTime}` : ""}` : "No bid due date"}{opportunity.responsibleUserName ? ` · ${opportunity.responsibleUserName}` : ""}</p>
          </Link>
          <Button variant="outline" size="sm" className="min-h-11 w-full" onClick={() => setStatusOpen(true)} data-testid={`button-quick-status-${opportunity.id}`}>Change status</Button>
        </CardContent>
      </Card>
      <OpportunityStatusDialog open={statusOpen} onOpenChange={setStatusOpen} id={opportunity.id} current={opportunity.status} />
    </>
  );
}

export default function Opportunities() {
  const { isAdmin } = useAuth();
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const get = (key: string, fallback = "") => params.get(key) || fallback;
  const view = (get("view", "pipeline") as View);
  const page = Math.max(1, Number(get("page", "1")) || 1);
  const sort = get("sort", "bidDueDate") as OpportunityListFilters["sortBy"];
  const direction = get("direction", "asc") as "asc" | "desc";
  const [formOpen, setFormOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const updateParams = (changes: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(searchString);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetPage && !("page" in changes)) next.delete("page");
    navigate(`/bidding${next.toString() ? `?${next}` : ""}`, { replace: true });
  };
  const status = get("status");
  const filters: OpportunityListFilters = {
    search: get("search") || undefined,
    // With no explicit status, the server applies the canonical active-work
    // predicate while still returning an accurate outcome summary.
    status: status || undefined,
    responsibleUserId: get("owner") && get("owner") !== "me" ? get("owner") : undefined,
    my: get("owner") === "me", source: get("source") || undefined,
    projectType: get("projectType") || undefined,
    customerId: get("customer") ? Number(get("customer")) : undefined,
    bidDueFrom: get("bidDueFrom") || undefined, bidDueTo: get("bidDueTo") || undefined,
    urgency: (get("due") || undefined) as OpportunityListFilters["urgency"],
    archive: (get("archive", "active")) as OpportunityListFilters["archive"],
    outcome: get("outcome") || undefined,
    sortBy: sort, sortDir: direction, page, pageSize: 25,
  };
  const { data, isLoading, isError } = useOpportunities(filters);
  const items = data?.items || [];
  const summary = data?.summary;
  const hasFilters = ["search", "status", "owner", "customer", "source", "projectType", "bidDueFrom", "bidDueTo", "due", "archive", "outcome"].some(k => params.has(k));

  const summaryCards = [
    { label: "Active bids", value: summary?.active || 0, icon: Target, params: { outcome: undefined, archive: "active", status: ACTIVE_STATUS_PARAM } },
    { label: "Overdue", value: summary?.overdue || 0, icon: AlertCircle, params: { due: "overdue" } },
    { label: "Due today", value: summary?.dueToday || 0, icon: CalendarClock, params: { due: "today" } },
    { label: "Unassigned", value: summary?.unassigned || 0, icon: UserRoundX, params: { owner: "unassigned" } },
    { label: "Outcomes", value: summary?.outcomes || 0, icon: Archive, params: { outcome: OPPORTUNITY_OUTCOME_STATUSES.join(","), archive: "all", due: undefined, status: undefined } },
  ];

  return (
    <div className="space-y-5 pt-14 md:pt-0 min-w-0">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Target className="w-7 h-7 text-primary" />Bidding</h1><p className="text-sm text-muted-foreground mt-1">Track every opportunity from invitation through outcome.</p></div>
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4 mr-2" />New opportunity</Button>
      </header>

      {isAdmin && <AwardCatchUpPanel />}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {summaryCards.map(card => <button key={card.label} className="text-left min-h-[84px]" onClick={() => updateParams(card.params)} data-testid={`button-bidding-summary-${card.label.toLowerCase().replaceAll(" ", "-")}`}><Card className="h-full hover:border-primary/60"><CardContent className="p-4"><div className="flex justify-between"><p className="text-xs text-muted-foreground">{card.label}</p><card.icon className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-1">{card.value}</p></CardContent></Card></button>)}
      </div>

      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1 min-w-0"><Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" /><Input className="pl-9 min-h-11" value={get("search")} onChange={e => updateParams({ search: e.target.value })} placeholder="Search bid, number, or customer…" /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-2">
              <Select value={status === ALL_STATUS_PARAM ? "all" : status || (get("outcome") ? "all" : ACTIVE_STATUS_PARAM)} onValueChange={v => updateParams({ status: v === "all" ? ALL_STATUS_PARAM : v, outcome: undefined })}><SelectTrigger className="min-h-11 lg:w-40" data-testid="select-bidding-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value={ACTIVE_STATUS_PARAM}>Active pipeline</SelectItem>{OPPORTUNITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
              <Select value={get("owner", "all")} onValueChange={v => updateParams({ owner: v === "all" ? undefined : v })}><SelectTrigger className="min-h-11 lg:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem><SelectItem value="me">My bids</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem></SelectContent></Select>
              <Select value={get("due", "all")} onValueChange={v => updateParams({ due: v === "all" ? undefined : v })}><SelectTrigger className="min-h-11 lg:w-36" data-testid="select-bidding-due"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any due date</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="today">Due today</SelectItem><SelectItem value="tomorrow">Due tomorrow</SelectItem><SelectItem value="this_week">Due this week</SelectItem><SelectItem value="next_7_days">Due next 7 days</SelectItem><SelectItem value="no_due_date">No due date</SelectItem></SelectContent></Select>
              <Select value={get("source", "all")} onValueChange={v => updateParams({ source: v === "all" ? undefined : v })}><SelectTrigger className="min-h-11 lg:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{OPPORTUNITY_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
              <Select value={get("projectType", "all")} onValueChange={v => updateParams({ projectType: v === "all" ? undefined : v })}><SelectTrigger className="min-h-11 lg:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{OPPORTUNITY_PROJECT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
              <Select value={get("customer", "all")} onValueChange={v => updateParams({ customer: v === "all" ? undefined : v })}><SelectTrigger className="min-h-11 lg:w-40" data-testid="select-bidding-customer"><SelectValue placeholder="All customers" /></SelectTrigger><SelectContent><SelectItem value="all">All customers</SelectItem>{customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" variant={get("outcome") ? "default" : "outline"} onClick={() => updateParams({ outcome: get("outcome") ? undefined : OPPORTUNITY_OUTCOME_STATUSES.join(","), archive: get("outcome") ? "active" : "all", status: undefined })}>Outcomes</Button>
              <Select value={get("archive", "active")} onValueChange={v => updateParams({ archive: v === "active" ? undefined : v })}><SelectTrigger className="min-h-11 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active only</SelectItem><SelectItem value="archived">Archived only</SelectItem><SelectItem value="all">Active + archive</SelectItem></SelectContent></Select>
              <Button className="min-h-11" variant="outline" onClick={() => setAdvancedOpen(value => !value)} data-testid="button-bidding-advanced-filters">Advanced dates</Button>
              {hasFilters && <Button className="min-h-11" variant="ghost" onClick={() => navigate(`/bidding?view=${view}`, { replace: true })}><X className="w-4 h-4 mr-1" />Clear filters</Button>}
            </div>
            <div className="flex border rounded-md p-1"><Button size="sm" className="min-h-9" variant={view === "pipeline" ? "secondary" : "ghost"} onClick={() => updateParams({ view: "pipeline" }, false)}><Columns3 className="w-4 h-4 mr-1" />Pipeline</Button><Button size="sm" className="min-h-9" variant={view === "list" ? "secondary" : "ghost"} onClick={() => updateParams({ view: "list" }, false)}><List className="w-4 h-4 mr-1" />List</Button></div>
          </div>
          {advancedOpen && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3"><div><label className="text-sm font-medium">Bid due from</label><Input className="min-h-11 mt-1" type="date" value={get("bidDueFrom")} onChange={e => updateParams({ bidDueFrom: e.target.value })} data-testid="input-bid-due-from" /></div><div><label className="text-sm font-medium">Bid due to</label><Input className="min-h-11 mt-1" type="date" value={get("bidDueTo")} onChange={e => updateParams({ bidDueTo: e.target.value })} data-testid="input-bid-due-to" /></div></div>}
        </CardContent>
      </Card>

      {isLoading ? <div className="py-16 text-center text-muted-foreground">Loading bids…</div> : isError ? <div className="py-16 text-center"><p className="font-medium">Unable to load bidding</p><p className="text-sm text-muted-foreground">Refresh the page to try again.</p></div> : items.length === 0 ? <Card><CardContent className="py-16 text-center"><Target className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" /><p className="font-medium">{hasFilters ? "No bids match these filters" : "No opportunities yet"}</p><p className="text-sm text-muted-foreground mt-1">{hasFilters ? "Clear filters or broaden your search." : "Create your first opportunity to start the pipeline."}</p>{hasFilters && <Button variant="outline" className="mt-4 min-h-11" onClick={() => navigate(`/bidding?view=${view}`)}>Clear filters</Button>}</CardContent></Card> : view === "pipeline" ? (
        <div className="hidden md:grid grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {(get("outcome") ? OPPORTUNITY_STATUSES.filter(s => get("outcome").split(",").includes(s.value)) : status ? OPPORTUNITY_STATUSES.filter(s => status.split(",").includes(s.value)) : ACTIVE).map(status => {
            const bids = items.filter(o => o.status === status.value);
            return <Card key={status.value} className="min-w-0"><CardHeader className="p-3"><CardTitle className="text-sm flex justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />{status.label}</span><Badge variant="secondary">{data?.statusCounts?.[status.value] ?? bids.length}</Badge></CardTitle></CardHeader><CardContent className="p-2 pt-0 space-y-2">{bids.length ? bids.map(o => <BidCard key={o.id} opportunity={o} compact canViewValues={data?.canViewValues} backQuery={searchString} />) : <p className="text-xs text-muted-foreground text-center py-6">No bids</p>}</CardContent></Card>;
          })}
        </div>
      ) : (
        <BidList items={items} sort={sort || "bidDueDate"} direction={direction} canViewValues={data?.canViewValues || false} backQuery={searchString} onSort={(key) => updateParams({ sort: key, direction: sort === key && direction === "asc" ? "desc" : "asc" })} />
      )}
      {view === "pipeline" && <div className="md:hidden space-y-3">{items.map(o => <BidCard key={o.id} opportunity={o} canViewValues={data?.canViewValues} backQuery={searchString} />)}</div>}

      {(data?.pageCount || 1) > 1 && <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Page {data?.page} of {data?.pageCount} · {data?.total} bids</p><div className="flex gap-2"><Button variant="outline" className="min-h-11 min-w-11" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) }, false)}><ChevronLeft className="w-4 h-4" /></Button><Button variant="outline" className="min-h-11 min-w-11" disabled={page >= (data?.pageCount || 1)} onClick={() => updateParams({ page: String(page + 1) }, false)}><ChevronRight className="w-4 h-4" /></Button></div></div>}
      <OpportunityFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={id => navigate(`/bidding/${id}`)} />
    </div>
  );
}

function BidList({ items, sort, direction, canViewValues, backQuery, onSort }: { items: OpportunityWithDetails[]; sort: string; direction: string; canViewValues: boolean; backQuery: string; onSort: (key: string) => void }) {
  const [statusOpportunity, setStatusOpportunity] = useState<OpportunityWithDetails | null>(null);
  const SortHead = ({ field, children }: { field: string; children: React.ReactNode }) => <TableHead><button className="flex items-center min-h-11" onClick={() => onSort(field)}>{children}{sort === field && (direction === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />)}</button></TableHead>;
  return <><div className="hidden md:block border rounded-lg overflow-hidden"><Table><TableHeader><TableRow><SortHead field="name">Opportunity</SortHead><SortHead field="customer">Customer</SortHead><SortHead field="status">Status</SortHead><SortHead field="bidDueDate">Bid due</SortHead>{canViewValues && <SortHead field="expectedValue">Value</SortHead>}<SortHead field="responsible">Responsible</SortHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{items.map(o => { const urgency = dueState(o); return <TableRow key={o.id}><TableCell><Link href={`/bidding/${o.id}?from=${encodeURIComponent(backQuery)}`} className="block font-medium">{o.name}<span className="block text-xs text-muted-foreground font-mono">{o.opportunityNumber}</span></Link></TableCell><TableCell>{o.customerName}</TableCell><TableCell><Badge variant="outline" style={{ borderColor: getOpportunityStatusColor(o.status) }}>{getOpportunityStatusLabel(o.status)}</Badge></TableCell><TableCell>{o.bidDueDate || "—"}{urgency && <span className={cn("block text-xs", urgency.className.split(" ")[0])}>{urgency.label}</span>}</TableCell>{canViewValues && <TableCell>{o.expectedValue == null ? "—" : `$${o.expectedValue.toLocaleString()}`}</TableCell>}<TableCell>{o.responsibleUserName || "Unassigned"}</TableCell><TableCell><Button size="sm" variant="outline" className="min-h-11" onClick={() => setStatusOpportunity(o)} data-testid={`button-quick-status-row-${o.id}`}>Change status</Button></TableCell></TableRow>})}</TableBody></Table></div><div className="md:hidden space-y-3">{items.map(o => <BidCard key={o.id} opportunity={o} canViewValues={canViewValues} backQuery={backQuery} />)}</div>{statusOpportunity && <OpportunityStatusDialog open={!!statusOpportunity} onOpenChange={open => !open && setStatusOpportunity(null)} id={statusOpportunity.id} current={statusOpportunity.status} />}</>;
}