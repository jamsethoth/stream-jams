import { Button, NativeSelect, Tabs, TextInput, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DiagnosticsEventView,
  DiagnosticsProblemArea,
  DiagnosticsProblemView,
  DiagnosticsRawLogView,
  DiagnosticsWorkspaceView,
  EventBusActivityView
} from "@stream-jams/core";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import { ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { formatCount, formatDateTime } from "../foundation/formatters.js";
import type { DiagnosticsDebugExportView, DiagnosticsExportView, ManagementApi } from "../management-api.js";
import { SectionHeading } from "../foundation/ModulePageLayout.js";
import "./diagnostics-workspace.css";

type DiagnosticsTab = "problems" | "events" | "raw-logs" | "event-bus";
type BusEventView = EventBusActivityView["events"][number];
type BusConsumerOutcome = BusEventView["consumers"][number]["outcome"];
type SortOrder = "newest" | "oldest";

export interface DiagnosticsPanelProps {
  readonly initialReferenceId?: string | undefined;
  readonly managementApi: Pick<
    ManagementApi,
    "getDiagnosticsWorkspace" | "exportDiagnostics" | "exportDebugDiagnostics" | "getEventBusActivity"
  >;
}

export function DiagnosticsPanel({ initialReferenceId, managementApi }: DiagnosticsPanelProps) {
  const [workspace, setWorkspace] = useState<DiagnosticsWorkspaceView | null>(null);
  const [activeTab, setActiveTab] = useState<DiagnosticsTab>("problems");
  const [query, setQuery] = useState(initialReferenceId ?? "");
  const [filter, setFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [busActivity, setBusActivity] = useState<EventBusActivityView | null>(null);
  const [selectedBusEventId, setSelectedBusEventId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [loadNotice, setLoadNotice] = useState<InlineNotice | null>(null);
  const mounted = useRef(true);
  const appliedReferenceId = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    void loadWorkspace();
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setQuery(initialReferenceId ?? "");
    if (initialReferenceId === undefined) appliedReferenceId.current = null;
  }, [initialReferenceId]);

  useEffect(() => {
    if (workspace === null || initialReferenceId === undefined || appliedReferenceId.current === initialReferenceId) return;
    appliedReferenceId.current = initialReferenceId;
    const problem = workspace.problems.find((item) => item.referenceId === initialReferenceId);
    if (problem !== undefined) {
      setActiveTab("problems");
      setSelectedProblemId(problem.id);
      return;
    }
    const event = workspace.events.find((item) => item.referenceId === initialReferenceId);
    if (event !== undefined) {
      setActiveTab("events");
      setSelectedEventId(event.id);
      return;
    }
    const log = workspace.rawLogs.find((item) => item.referenceId === initialReferenceId);
    if (log !== undefined) {
      setActiveTab("raw-logs");
      setSelectedLogId(log.id);
      return;
    }
    const busEvent = busActivity?.events.find((item) => busEventReferences(item).includes(initialReferenceId));
    if (busEvent !== undefined) {
      setActiveTab("event-bus");
      setSelectedBusEventId(busEvent.id);
    }
  }, [initialReferenceId, workspace, busActivity]);

  const problems = useMemo(
    () => filterProblems(workspace?.problems ?? [], query, filter, sortOrder),
    [workspace, query, filter, sortOrder]
  );
  const events = useMemo(
    () => filterEvents(workspace?.events ?? [], query, filter, sortOrder),
    [workspace, query, filter, sortOrder]
  );
  const rawLogs = useMemo(
    () => filterRawLogs(workspace?.rawLogs ?? [], query, filter, sortOrder),
    [workspace, query, filter, sortOrder]
  );
  const busEvents = useMemo(
    () => filterBusEvents(busActivity?.events ?? [], query, filter, sortOrder),
    [busActivity, query, filter, sortOrder]
  );
  const selectedBusEvent = busEvents.find((event) => event.id === selectedBusEventId) ?? busEvents[0] ?? null;
  const tabs = managementApi.getEventBusActivity === undefined ? diagnosticsTabs : [...diagnosticsTabs, "event-bus" as const];
  const selectedProblem = problems.find((problem) => problem.id === selectedProblemId) ?? problems[0] ?? null;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedLog = rawLogs.find((log) => log.id === selectedLogId) ?? rawLogs[0] ?? null;

  async function loadWorkspace(): Promise<void> {
    setLoading(true);
    setNotice(null);
    setLoadNotice(null);
    try {
      const [result, activity] = await Promise.all([
        managementApi.getDiagnosticsWorkspace(),
        managementApi.getEventBusActivity?.().catch(
          // error-provenance: allow expected -- bus activity is supplementary; the Event intake tab says it is unavailable and the workspace still loads
          () => null
        ) ?? Promise.resolve(null)
      ]);
      if (mounted.current) {
        setWorkspace(result);
        setBusActivity(activity);
      }
    } catch (error) {
      if (mounted.current) {
        const failure = failureNotice("Diagnostics could not be loaded", error, "Check that the local service is running, then retry.");
        setLoadNotice({ title: failure.message, detail: failure.detail ?? "" });
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  function selectTab(tab: DiagnosticsTab): void {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setFilter("all");
    setNotice(null);
  }

  async function copyText(label: string, value: string): Promise<void> {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(value);
      setNotice({ tone: "success", message: `${label} copied`, detail: "The copied content is sanitized and safe to share." });
    } catch (error) {
      setNotice(failureNotice(`${label} could not be copied`, error, "Allow clipboard access, then retry."));
    }
  }

  async function exportBundle(includeRecentLogs: boolean): Promise<void> {
    setExporting(true);
    setNotice(null);
    try {
      const result = includeRecentLogs
        ? await managementApi.exportDebugDiagnostics({ limit: 200, runtimeLogLimit: 200, sinceHours: 2 })
        : await managementApi.exportDiagnostics({ limit: 200 });
      downloadSupportBundle(result);
      if (mounted.current) {
        setNotice({
          tone: "success",
          message: "Sanitized support bundle ready",
          detail: includeRecentLogs
            ? "The bundle includes bounded recent logs and excludes secrets."
            : "The bundle excludes recent raw logs and secrets."
        });
      }
    } catch (error) {
      if (mounted.current) {
        setNotice(
          failureNotice(
            "Support bundle could not be generated",
            error,
            "Retry once. If it still fails, use the reference ID in the error to locate the related raw log."
          )
        );
      }
    } finally {
      if (mounted.current) setExporting(false);
    }
  }

  return (
    <section aria-label="Diagnostics workspace" className="diagnostics-workspace">
      <header className="diagnostics-workspace__header">
        <div>
          <p>Failures remain visible with plain-language next steps, reference IDs, and sanitized evidence.</p>
        </div>
        <div className="diagnostics-workspace__actions">
          <Button disabled={exporting} onClick={() => void exportBundle(false)} type="button">Export support bundle</Button>
          <Button variant="default" disabled={exporting} onClick={() => void exportBundle(true)} type="button">
            Export with recent logs
          </Button>
        </div>
      </header>

      {loadNotice === null ? null : <NoticeBanner notice={loadNotice} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      <Tabs className="diagnostics-workspace__views" value={activeTab} onChange={(value) => { const tab = tabs.find((candidate) => candidate === value); if (tab !== undefined) selectTab(tab); }} keepMounted={false}>
        <Tabs.List aria-label="Diagnostics views">
          <Tabs.Tab value="problems" onFocus={() => selectTab("problems")}>Problems <span>{workspace?.problems.length ?? 0}</span></Tabs.Tab>
          <Tabs.Tab value="events" onFocus={() => selectTab("events")}>Events <span>{workspace?.events.length ?? 0}</span></Tabs.Tab>
          <Tabs.Tab value="raw-logs" onFocus={() => selectTab("raw-logs")}>Raw logs <span>{workspace?.rawLogs.length ?? 0}</span></Tabs.Tab>
          {tabs.includes("event-bus") ? <Tabs.Tab value="event-bus" onFocus={() => selectTab("event-bus")}>Event intake <span>{busActivity?.events.length ?? 0}</span></Tabs.Tab> : null}
        </Tabs.List>

      <div className="diagnostics-workspace__toolbar">
          <TextInput className="diagnostics-workspace__search" label="Search"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Reference ID or message"
            type="search"
            value={query}
          />
          <NativeSelect label={filterLabel(activeTab)} onChange={(event) => setFilter(event.currentTarget.value)} value={filter}>
            {filterOptions(activeTab).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </NativeSelect>
          <NativeSelect label="Sort" aria-label="Sort diagnostics" onChange={(event) => setSortOrder(event.currentTarget.value as SortOrder)} value={sortOrder}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </NativeSelect>
        <Button variant="default" className="diagnostics-workspace__reload" disabled={loading} onClick={() => void loadWorkspace()} type="button">
          Refresh
        </Button>
      </div>

      {loading ? <p className="management-empty" role="status">Loading diagnostics...</p> : null}
      {!loading && workspace === null ? (
        <div className="diagnostics-workspace__load-failure">
          <p>Diagnostics evidence is unavailable.</p>
          <Button onClick={() => void loadWorkspace()} type="button">Retry</Button>
        </div>
      ) : null}
      {tabs.map((tab) => <Tabs.Panel key={tab} value={tab} tabIndex={0}>
        {!loading && workspace !== null ? <div className="diagnostics-workspace__content">
          {tab === "problems" ? <ProblemsView onCopy={copyText} onSelect={setSelectedProblemId} problems={problems} selected={selectedProblem} /> : null}
          {tab === "events" ? <EventsView events={events} onSelect={setSelectedEventId} selected={selectedEvent} /> : null}
          {tab === "raw-logs" ? <RawLogsView logs={rawLogs} onCopy={copyText} onSelect={setSelectedLogId} selected={selectedLog} /> : null}
          {tab === "event-bus" ? <BusEventsView available={busActivity !== null} events={busEvents} onSelect={setSelectedBusEventId} selected={selectedBusEvent} /> : null}
        </div> : null}
      </Tabs.Panel>)}
      </Tabs>
    </section>
  );
}

function ProblemsView(props: {
  readonly problems: readonly DiagnosticsProblemView[];
  readonly selected: DiagnosticsProblemView | null;
  readonly onSelect: (id: string) => void;
  readonly onCopy: (label: string, value: string) => Promise<void>;
}) {
  return <><section aria-label="Open problems" className="diagnostics-workspace__list-pane">
    <SectionHeading level={3} title="Open problems" />
    {props.problems.length === 0 ? <EmptyState title="No active problems" detail="Connected services and recent operations have not reported a failure." /> :
      groupProblems(props.problems).map((group) => <section className="diagnostics-problem-group" key={group.key}>
        <h4>{group.label}</h4>
        <div className="diagnostics-problem-group__items">
          {group.problems.map((problem) => <UnstyledButton aria-pressed={props.selected?.id === problem.id} className="diagnostics-problem-row" key={problem.id} onClick={() => props.onSelect(problem.id)} type="button">
            <span><strong>{problem.summary}</strong><small>{problem.cause ?? problem.nextStep}</small></span>
            <span className="diagnostics-problem-row__meta"><StatusBadge label={problem.severity} tone={severityTone(problem.severity)} />{problem.referenceId}</span>
          </UnstyledButton>)}
        </div>
      </section>)}
  </section><DetailPane label="Selected problem">
    {props.selected === null ? <EmptyState title="No problem selected" detail="Select a problem to review its evidence and next step." /> : <>
      <StatusBadge label={`${areaLabel(props.selected.area)} · ${props.selected.severity}`} tone={severityTone(props.selected.severity)} />
      <h3>{props.selected.summary}</h3>
      {props.selected.cause === null ? null : <p>{props.selected.cause}</p>}
      <h4>Next step</h4><p>{props.selected.nextStep}</p>
      <EvidenceList occurredAt={props.selected.occurredAt} referenceId={props.selected.referenceId} />
      <div className="diagnostics-workspace__detail-actions">
        {props.selected.correction === null ? null : <Button component="a" href={props.selected.correction.route}>{props.selected.correction.label}</Button>}
        <Button variant="default" onClick={() => void props.onCopy("Error JSON", JSON.stringify(props.selected, null, 2))} type="button">Copy error JSON</Button>
        {props.selected.referenceId === null ? null : <Button variant="default" onClick={() => void props.onCopy("Reference ID", props.selected!.referenceId!)} type="button">Copy reference ID</Button>}
      </div>
    </>}
  </DetailPane></>;
}

function EventsView(props: { readonly events: readonly DiagnosticsEventView[]; readonly selected: DiagnosticsEventView | null; readonly onSelect: (id: string) => void }) {
  return <><section aria-label="Received events" className="diagnostics-workspace__list-pane"><SectionHeading level={3} title="Received events" />
    {props.events.length === 0 ? <EmptyState title="No matching events" detail="Change the session filters or wait for a connected event source." /> : <div className="management-table-wrap"><table className="management-table diagnostics-event-table"><thead><tr><th>Time</th><th>Source</th><th>Event</th><th>Matched</th><th>Result</th></tr></thead><tbody>
      {props.events.map((event) => <tr aria-selected={props.selected?.id === event.id} key={event.id}><td><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></td><td>{event.providerKind}</td><td><Button variant="subtle" className="diagnostics-event-table__select" onClick={() => props.onSelect(event.id)} type="button">{event.eventType}</Button></td><td>{event.alertIds.length === 0 ? "No alert" : formatCount(event.alertIds.length, { one: "alert", other: "alerts" })}</td><td><StatusBadge label={event.playbackStatus ?? event.outcome} tone={outcomeTone(event.outcome)} /></td></tr>)}
    </tbody></table></div>}
  </section><DetailPane label="Event detail">{props.selected === null ? <EmptyState title="No event selected" detail="Select an event to inspect its sanitized payload and matching result." /> : <>
    <StatusBadge label={props.selected.playbackStatus ?? props.selected.outcome} tone={outcomeTone(props.selected.outcome)} /><h3>{props.selected.eventType}</h3>
    <dl className="diagnostics-workspace__facts"><div><dt>Provider</dt><dd>{props.selected.providerKind} · {props.selected.providerId}</dd></div><div><dt>Mode</dt><dd>{props.selected.test ? "Test" : "Live"}</dd></div><div><dt>Occurred</dt><dd><time dateTime={props.selected.occurredAt}>{formatDateTime(props.selected.occurredAt)}</time></dd></div><div><dt>Actor</dt><dd>{props.selected.actorDisplayName}</dd></div><div><dt>Matched alerts</dt><dd>{props.selected.alertIds.join(", ") || "None"}</dd></div><div><dt>Reference ID</dt><dd>{props.selected.referenceId}</dd></div></dl>
    {props.selected.errorMessage === null ? null : <p className="diagnostics-workspace__inline-error">{props.selected.errorMessage}</p>}
    <h4>Sanitized payload</h4><pre>{JSON.stringify(props.selected.sanitizedPayload, null, 2)}</pre>
    {props.selected.correction === null ? null : <Button component="a" href={props.selected.correction.route}>{props.selected.correction.label}</Button>}
  </>}</DetailPane></>;
}

function RawLogsView(props: { readonly logs: readonly DiagnosticsRawLogView[]; readonly selected: DiagnosticsRawLogView | null; readonly onSelect: (id: string) => void; readonly onCopy: (label: string, value: string) => Promise<void> }) {
  return <><section aria-label="Raw logs" className="diagnostics-workspace__list-pane"><SectionHeading level={3} title="Raw logs" />
    {props.logs.length === 0 ? <EmptyState title="No matching raw logs" detail="Change the session filters or refresh after reproducing the issue." /> : <div className="diagnostics-log-list">{props.logs.map((log) => <UnstyledButton aria-pressed={props.selected?.id === log.id} className={`diagnostics-log-row diagnostics-log-row--${log.level.toLowerCase()}`} key={log.id} onClick={() => props.onSelect(log.id)} type="button"><time dateTime={log.timestamp}>{formatTime(log.timestamp)}</time><span>{log.level.toLowerCase()}</span><strong>{log.referenceId ?? log.event}</strong><small>{log.message}</small></UnstyledButton>)}</div>}
  </section><DetailPane label="Raw log detail">{props.selected === null ? <EmptyState title="No log selected" detail="Select a raw log to inspect its redacted evidence." /> : <>
    <StatusBadge label={props.selected.level} tone={logTone(props.selected.level)} /><h3>{props.selected.referenceId ?? props.selected.event}</h3><p>{props.selected.message}</p>
    <EvidenceList occurredAt={props.selected.timestamp} referenceId={props.selected.referenceId} />
    <pre>{JSON.stringify(sanitizedLogBundle(props.selected), null, 2)}</pre>
    <div className="diagnostics-workspace__detail-actions">{props.selected.correction === null ? null : <Button component="a" href={props.selected.correction.route}>{props.selected.correction.label}</Button>}<Button variant="default" onClick={() => void props.onCopy("Sanitized event", JSON.stringify(sanitizedLogBundle(props.selected!), null, 2))} type="button">Copy sanitized event</Button></div>
  </>}</DetailPane></>;
}

function BusEventsView(props: { readonly available: boolean; readonly events: readonly BusEventView[]; readonly selected: BusEventView | null; readonly onSelect: (id: number) => void }) {
  return <><section aria-label="Event intake" className="diagnostics-workspace__list-pane"><SectionHeading level={3} title="Event intake" />
    {!props.available ? <EmptyState title="Event intake is unavailable" detail="Refresh to try loading bus activity again." /> : props.events.length === 0 ? <EmptyState title="No matching bus events" detail="Change the filters or wait for a connected event source." /> : <div className="management-table-wrap"><table className="management-table diagnostics-event-table"><thead><tr><th>Time</th><th>Source</th><th>Event</th><th>Intake</th><th>Modules</th></tr></thead><tbody>
      {props.events.map((event) => <tr aria-selected={props.selected?.id === event.id} key={event.id}><td><time dateTime={event.receivedAt}>{formatTime(event.receivedAt)}</time></td><td>{sourceLabel(event.sourceKind)}</td><td><Button variant="subtle" className="diagnostics-event-table__select" onClick={() => props.onSelect(event.id)} type="button">{busEventLabel(event)}</Button></td><td><StatusBadge label={capitalize(event.outcome)} tone={intakeTone(event.outcome)} /></td><td>{consumerSummary(event)}</td></tr>)}
    </tbody></table></div>}
  </section><DetailPane label="Bus event detail">{props.selected === null ? <EmptyState title="No bus event selected" detail="Select a bus event to see what each module did with it." /> : <>
    <StatusBadge label={capitalize(props.selected.outcome)} tone={intakeTone(props.selected.outcome)} /><h3>{busEventLabel(props.selected)}</h3>
    <p>{intakeDescription(props.selected.outcome)}</p>
    <dl className="diagnostics-workspace__facts"><div><dt>Source</dt><dd>{sourceLabel(props.selected.sourceKind)}</dd></div><div><dt>Kind</dt><dd>{props.selected.kind === null ? "Not published" : props.selected.kind === "canonical" ? "Stream event" : "Streamer.bot event"}</dd></div><div><dt>Received</dt><dd><time dateTime={props.selected.receivedAt}>{formatDateTime(props.selected.receivedAt)}</time></dd></div><div><dt>Reference ID</dt><dd>{props.selected.referenceId ?? "Not available"}</dd></div></dl>
    {props.selected.consumers.length === 0 ? null : <><h4>Modules</h4><ul aria-label="Module outcomes" className="diagnostics-bus-consumers">{props.selected.consumers.map((consumer) => <li key={consumer.consumerId}><span>{consumerLabel(consumer.consumerId)}</span><StatusBadge label={consumerOutcomeLabel(consumer.outcome)} tone={consumerTone(consumer.outcome)} />{consumer.referenceId === null ? null : <code>{consumer.referenceId}</code>}</li>)}</ul></>}
  </>}</DetailPane></>;
}

function DetailPane({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return <section aria-label={label} className="diagnostics-workspace__detail-pane">{children}</section>;
}

const diagnosticsTabs: readonly DiagnosticsTab[] = ["problems", "events", "raw-logs"];

function EmptyState({ detail, title }: { readonly detail: string; readonly title: string }) {
  return <div className="diagnostics-workspace__empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function EvidenceList({ occurredAt, referenceId }: { readonly occurredAt: string | null; readonly referenceId: string | null }) {
  return <dl className="diagnostics-workspace__facts">{occurredAt === null ? null : <div><dt>Occurred</dt><dd><time dateTime={occurredAt}>{formatDateTime(occurredAt)}</time></dd></div>}<div><dt>Reference ID</dt><dd>{referenceId ?? "Not available"}</dd></div></dl>;
}

interface InlineNotice { readonly title: string; readonly detail: string }

function NoticeBanner({ notice }: { readonly notice: InlineNotice }) {
  return <div className="diagnostics-workspace__notice diagnostics-workspace__notice--negative" role="alert"><strong>{notice.title}</strong><span>{notice.detail}</span></div>;
}

function failureNotice(title: string, error: unknown, nextStep: string): ManagementToastNotice {
  return { tone: "failure", message: title, detail: `${error instanceof Error ? error.message : "An unexpected error occurred."} ${nextStep}` };
}

function sanitizedLogBundle(log: DiagnosticsRawLogView) {
  return { timestamp: log.timestamp, level: log.level, component: log.component, event: log.event, message: log.message, referenceId: log.referenceId, processingId: log.processingId, data: log.data };
}

function downloadSupportBundle(bundle: DiagnosticsExportView | DiagnosticsDebugExportView): void {
  if (typeof URL.createObjectURL !== "function") {
    throw new Error("This browser cannot create the diagnostics download.");
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.download = `stream-jams-${bundle.debugExport ? "debug-" : ""}diagnostics-${bundle.generatedAt.replaceAll(":", "-")}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function filterProblems(items: readonly DiagnosticsProblemView[], query: string, filter: string, sortOrder: SortOrder) {
  return sortByDate(items.filter((item) => (filter === "all" || item.area === filter) && matches(query, item.referenceId, item.summary, item.cause, item.nextStep)), (item) => item.occurredAt, sortOrder);
}

function filterEvents(items: readonly DiagnosticsEventView[], query: string, filter: string, sortOrder: SortOrder) {
  return sortByDate(items.filter((item) => (filter === "all" || item.outcome === filter) && matches(query, item.referenceId, item.eventType, item.providerId, item.actorDisplayName, ...item.alertIds)), (item) => item.occurredAt, sortOrder);
}

function filterBusEvents(items: readonly BusEventView[], query: string, filter: string, sortOrder: SortOrder) {
  return sortByDate(items.filter((item) => matchesBusFilter(item, filter) && matches(query, item.eventType, ...busEventReferences(item))), (item) => item.receivedAt, sortOrder);
}

function matchesBusFilter(item: BusEventView, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "failed" || filter === "expired") return item.consumers.some((consumer) => consumer.outcome === filter);
  return item.outcome === filter;
}

function busEventReferences(item: BusEventView): string[] {
  return [item.referenceId, ...item.consumers.map((consumer) => consumer.referenceId)].filter((value): value is string => value !== null);
}

function busEventLabel(event: BusEventView): string {
  return event.eventType ?? "Rejected input";
}

function sourceLabel(sourceKind: BusEventView["sourceKind"]): string {
  return sourceKind === "twitch" ? "Twitch" : "Streamer.bot";
}

function consumerLabel(consumerId: string): string {
  return ({ alerts: "Alerts", "screen-effects": "Screen Effects", timers: "Timers", videos: "Videos" } as Record<string, string>)[consumerId] ?? consumerId;
}

function consumerOutcomeLabel(outcome: BusConsumerOutcome): string {
  return ({ admitted: "Admitted", "no-match": "No match", failed: "Failed", expired: "Expired", pending: "Pending" })[outcome];
}

function consumerSummary(event: BusEventView): string {
  if (event.consumers.length === 0) return "None";
  const counts = new Map<BusConsumerOutcome, number>();
  for (const consumer of event.consumers) counts.set(consumer.outcome, (counts.get(consumer.outcome) ?? 0) + 1);
  return [...counts.entries()].map(([outcome, count]) => `${count} ${consumerOutcomeLabel(outcome).toLowerCase()}`).join(" · ");
}

function intakeDescription(outcome: BusEventView["outcome"]): string {
  return ({
    accepted: "Accepted and delivered to each module.",
    duplicate: "Already received from this source, so it was not delivered again.",
    merged: "The other source already delivered the same event, so this copy was merged into it.",
    rejected: "The source sent input that failed validation. Use the reference ID to find the raw log."
  })[outcome];
}

function intakeTone(outcome: BusEventView["outcome"]): StatusBadgeTone {
  return outcome === "rejected" ? "negative" : outcome === "accepted" ? "positive" : "info";
}

function consumerTone(outcome: BusConsumerOutcome): StatusBadgeTone {
  return outcome === "failed" ? "negative" : outcome === "expired" ? "warning" : outcome === "admitted" ? "positive" : "neutral";
}

function filterRawLogs(items: readonly DiagnosticsRawLogView[], query: string, filter: string, sortOrder: SortOrder) {
  return sortByDate(items.filter((item) => (filter === "all" || item.level === filter) && matches(query, item.referenceId, item.event, item.component, item.message)), (item) => item.timestamp, sortOrder);
}

function sortByDate<T>(items: readonly T[], dateFor: (item: T) => string | null, order: SortOrder): T[] {
  return [...items].sort((left, right) => (order === "newest" ? -1 : 1) * (dateFor(left) ?? "").localeCompare(dateFor(right) ?? ""));
}

function matches(query: string, ...values: readonly (string | null)[]): boolean {
  const normalized = query.trim().toLowerCase();
  return normalized === "" || values.some((value) => value?.toLowerCase().includes(normalized));
}

function groupProblems(problems: readonly DiagnosticsProblemView[]) {
  const order = ["critical", "error", "warning", "info"] as const;
  const groups = new Map<string, DiagnosticsProblemView[]>();
  for (const problem of problems) {
    const key = `${problem.severity}:${problem.area}`;
    groups.set(key, [...(groups.get(key) ?? []), problem]);
  }
  return [...groups.entries()].sort(([left], [right]) => {
    const [leftSeverity = "info"] = left.split(":");
    const [rightSeverity = "info"] = right.split(":");
    return order.indexOf(leftSeverity as typeof order[number]) - order.indexOf(rightSeverity as typeof order[number]) || left.localeCompare(right);
  }).map(([key, grouped]) => ({ key, label: `${capitalize(key.split(":")[0] ?? "info")} · ${areaLabel(grouped[0]!.area)}`, problems: grouped }));
}

function filterLabel(tab: DiagnosticsTab): string {
  return tab === "problems" ? "Area" : tab === "events" || tab === "event-bus" ? "Outcome" : "Level";
}

function filterOptions(tab: DiagnosticsTab) {
  if (tab === "problems") return [{ value: "all", label: "All areas" }, ...(["providers", "alerts", "assets", "outputs", "settings", "runtime"] as const).map((value) => ({ value, label: areaLabel(value) }))];
  if (tab === "event-bus") return [{ value: "all", label: "All" }, ...["accepted", "duplicate", "merged", "rejected"].map((value) => ({ value, label: capitalize(value) })), { value: "failed", label: "Module failed" }, { value: "expired", label: "Module expired" }];
  if (tab === "events") return ["all", "received", "processed", "ignored", "failed"].map((value) => ({ value, label: capitalize(value) }));
  return ["all", "DEBUG", "INFO", "WARN", "ERROR"].map((value) => ({ value, label: value === "all" ? "All levels" : value }));
}

function areaLabel(area: DiagnosticsProblemArea): string {
  return ({ providers: "Providers", alerts: "Alerts", assets: "Assets", outputs: "Outputs", settings: "Settings", runtime: "Runtime" })[area];
}

function severityTone(severity: DiagnosticsProblemView["severity"]): StatusBadgeTone {
  return severity === "critical" || severity === "error" ? "negative" : severity === "warning" ? "warning" : "info";
}

function outcomeTone(outcome: DiagnosticsEventView["outcome"]): StatusBadgeTone {
  return outcome === "failed" ? "negative" : outcome === "ignored" ? "warning" : outcome === "processed" ? "positive" : "info";
}

function logTone(level: DiagnosticsRawLogView["level"]): StatusBadgeTone {
  return level === "ERROR" ? "negative" : level === "WARN" ? "warning" : level === "INFO" ? "info" : "neutral";
}

function capitalize(value: string): string { return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`; }
function formatTime(value: string): string { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
