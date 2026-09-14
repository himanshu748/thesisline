import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import Landing from "./Landing";
import { Brand, Button, Notice, errorText, readings, stamp } from "./ui";
import "./App.css";

function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const update = () => {
      setRoute(location.hash);
      if (location.hash !== "#example") window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (
    route.startsWith("#workspace") ||
    route.startsWith("#watch=") ||
    route === "#signin"
  )
    return isLoading ? (
      <Loading />
    ) : isAuthenticated ? (
      <Workspace
        deepLink={route.startsWith("#watch=") ? route.slice(7) : null}
      />
    ) : (
      <Auth />
    );
  return <Landing authenticated={isAuthenticated} />;
}
function Loading() {
  return (
    <div className="loading-page">
      <Brand />
      <LoaderCircle className="spin" />
      <p>Opening your research desk…</p>
    </div>
  );
}

function Auth() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    data.set("flow", flow);
    try {
      await signIn("password", data);
      if (!location.hash.startsWith("#watch=")) location.hash = "workspace";
    } catch {
      setError(
        flow === "signUp"
          ? "We couldn't create this account. Use a valid email and a password of at least 8 characters. If you already have an account, sign in."
          : "We couldn't sign you in. Check your email and password, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">A LITTLE LESS NOISE</p>
          <h1>
            Build a view.
            <br />
            <em>Keep the receipts.</em>
          </h1>
          <p>
            Your private research desk for company disclosures and the questions
            behind your watchlist.
          </p>
        </div>
        <a className="text-link" href="#example">
          Explore the example first <ArrowUpRight size={16} />
        </a>
      </div>
      <section className="auth-panel">
        <a className="auth-home" href="#">
          ← Back to home
        </a>
        <div>
          <span className="eyebrow">THESISLINE / YOUR WORKSPACE</span>
          <h2>
            {flow === "signUp" ? "Start your research." : "Welcome back."}
          </h2>
          <p>
            {flow === "signUp"
              ? "Save a question. Follow its evidence over time."
              : "Pick up the questions you are following."}
          </p>
          <form onSubmit={submit} aria-busy={busy}>
            <label>
              Email address
              <input
                type="email"
                name="email"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "auth-error" : undefined}
                onChange={() => setError("")}
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "auth-error" : undefined}
                onChange={() => setError("")}
                autoComplete={
                  flow === "signUp" ? "new-password" : "current-password"
                }
                minLength={8}
                required
                placeholder="At least 8 characters"
              />
            </label>
            {error && <p id="auth-error" role="alert" className="notice">{error}</p>}
            <Button className="button full" busy={busy}>
              {flow === "signUp" ? "Create your workspace" : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="auth-switch">
            {flow === "signUp"
              ? "Already have an account?"
              : "New to ThesisLine?"}{" "}
            <button
              onClick={() => {
                setFlow(flow === "signUp" ? "signIn" : "signUp");
                setError("");
              }}
            >
              {flow === "signUp" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <p className="auth-foot">
            Your research is private to your account. Email alerts require a
            separate verification and opt-in.
          </p>
        </div>
      </section>
    </main>
  );
}

function Workspace({ deepLink }: { deepLink: string | null }) {
  const { signOut } = useAuthActions();
  const watches = useQuery(api.watches.list, {});
  const viewer = useQuery(api.watches.viewer, {});
  const companies = useQuery(api.watches.companies, {});
  const [selected, setSelected] = useState<string | null>(deepLink);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    setSelected(deepLink);
    if (deepLink) setCreating(false);
  }, [deepLink]);
  const active = selected
    ? watches?.find((w) => w._id === selected)
    : watches?.[0];
  const unavailable =
    !creating && !!selected && watches !== undefined && !active;
  return (
    <div className="workspace">
      <header className="workspace-header">
        <Brand />
        <div>
          <span className="private-label">
            <span className="status-dot" /> Private research desk
          </span>
          <button
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              void signOut();
              location.hash = "";
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="watch-sidebar">
          <div className="sidebar-heading">
            <span className="label">
              YOUR QUESTIONS{" "}
              <span className="count">{watches?.length ?? 0}</span>
            </span>
            <button
              className="icon-button add-watch"
              aria-label="New research question"
              onClick={() => setCreating(true)}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="watch-list">
            {watches?.map((w) => (
              <button
                key={w._id}
                className={`watch-item ${active?._id === w._id && !creating ? "active" : ""}`}
                onClick={() => {
                  setSelected(w._id);
                  setCreating(false);
                  location.hash = `watch=${w._id}`;
                }}
              >
                <span className="watch-symbol">
                  {w.symbol}
                  <span className={`watch-state ${w.lastCheckState ?? ""}`} />
                </span>
                <span className="watch-question">{w.question}</span>
                <small>
                  {w.lastCheckState === "running" ||
                  w.lastCheckState === "queued"
                    ? "Checking sources…"
                    : stamp(w.lastCheckAt)}
                </small>
              </button>
            ))}
          </div>
          <button className="new-question" onClick={() => setCreating(true)}>
            <Plus size={16} /> New question
          </button>
          <div className="sidebar-bottom">
            <BookOpen size={18} />
            <p>
              A watch is a question you can revisit, with its source evidence
              intact.
            </p>
            <span>{viewer?.email}</span>
          </div>
        </aside>
        <main className="research-main">
          {watches === undefined || companies === undefined ? (
            <div className="workspace-loading">
              <LoaderCircle className="spin" /> Loading your questions…
            </div>
          ) : unavailable ? (
            <section className="empty-evidence">
              <BookOpen size={28} />
              <h1>This question is unavailable in this account.</h1>
              <p>
                It may have been archived, or the link may belong to a different
                account. Choose one of your saved questions or return to your
                workspace.
              </p>
              <a
                className="button small"
                href="#workspace"
                onClick={() => setSelected(null)}
              >
                Open your workspace
              </a>
            </section>
          ) : creating || !active ? (
            <NewWatch
              companies={companies}
              onCreate={(id) => {
                setSelected(id);
                setCreating(false);
                location.hash = `watch=${id}`;
              }}
              onCancel={active ? () => setCreating(false) : undefined}
            />
          ) : (
            <>
              <WatchDetail
                key={active._id}
                watchId={active._id}
                onArchive={() => {
                  setSelected(null);
                  location.hash = "workspace";
                }}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

type Company = {
  symbol: string;
  name: string;
  sector: string;
  sources: { url: string; label: string }[];
  sampleQuestions: string[];
};
function NewWatch({
  companies,
  onCreate,
  onCancel,
}: {
  companies: Company[];
  onCreate: (id: Id<"watches">) => void;
  onCancel?: () => void;
}) {
  const create = useMutation(api.watches.create);
  const [symbol, setSymbol] = useState(companies[0]?.symbol ?? "INFY");
  const [question, setQuestion] = useState("");
  const [daily, setDaily] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const company = companies.find((c) => c.symbol === symbol);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const id = await create({ symbol, question, dailyEnabled: daily });
      onCreate(id);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="new-watch-page">
      <div className="page-kicker">
        <span className="eyebrow">A QUESTION WORTH FOLLOWING</span>
        {onCancel && (
          <button className="text-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <h1>
        What would change
        <br />
        <em>your view?</em>
      </h1>
      <p className="new-watch-intro">
        Choose a company and a specific question. Your first check will look for
        relevant evidence in its official disclosures.
      </p>
      <form className="research-form" onSubmit={submit}>
        <label>
          01 <span>Choose a company</span>
          <select
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setQuestion("");
            }}
          >
            {companies.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.name} · {c.symbol}
              </option>
            ))}
          </select>
        </label>
        <p className="field-caption">
          Initial coverage is limited to Infosys and ITC.
        </p>
        <label>
          02 <span>Write your research question</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Has the company changed its revenue-growth guidance?"
            minLength={12}
            maxLength={400}
            required
            rows={3}
          />
        </label>
        <div className="question-examples">
          <span>Or start here</span>
          {company?.sampleQuestions.map((q) => (
            <button type="button" key={q} onClick={() => setQuestion(q)}>
              {q}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={daily}
            onChange={(e) => setDaily(e.target.checked)}
          />
          <span>
            Check these sources daily
            <small>You can change this later. Your first check runs now.</small>
          </span>
        </label>
        {error && <Notice>{error}</Notice>}
        <Button className="button" busy={busy}>
          Create question & check sources
          <ArrowRight size={17} />
        </Button>
      </form>
      <div className="sources-preview">
        <span className="label">
          OFFICIAL SOURCES FOR {company?.name.toUpperCase()}
        </span>
        {company?.sources.map((source) => (
          <a
            href={source.url}
            key={source.url}
            target="_blank"
            rel="noreferrer"
          >
            <FileText size={15} />
            {source.label}
            <ExternalLink size={13} />
          </a>
        ))}
        <p>
          Checks cover a bounded selection of official pages and linked
          disclosures. They may surface older announcements and do not provide
          an exhaustive company feed.
        </p>
      </div>
    </section>
  );
}

function WatchDetail({
  watchId,
  onArchive,
}: {
  watchId: Id<"watches">;
  onArchive: () => void;
}) {
  const data = useQuery(api.watches.detail, { watchId });
  const check = useMutation(api.watches.checkLatest);
  const daily = useMutation(api.watches.setDaily).withOptimisticUpdate(
    (store, { watchId, enabled }) => {
      const detail = store.getQuery(api.watches.detail, { watchId });
      if (detail)
        store.setQuery(
          api.watches.detail,
          { watchId },
          { ...detail, watch: { ...detail.watch, dailyEnabled: enabled } },
        );
      const list = store.getQuery(api.watches.list, {});
      if (list)
        store.setQuery(
          api.watches.list,
          {},
          list.map((w) =>
            w._id === watchId ? { ...w, dailyEnabled: enabled } : w,
          ),
        );
    },
  );
  const archive = useMutation(api.watches.archive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<Doc<"snapshots"> | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="workspace-loading">
        <LoaderCircle className="spin" /> Opening the evidence…
      </div>
    );
  const { watch, events, snapshots, recentChecks } = data;
  const running =
    watch.lastCheckState === "queued" || watch.lastCheckState === "running";
  const newest = recentChecks[0];
  const failedSources =
    newest?.sourceResults.filter((s) => s.state === "failed").length ?? 0;
  return (
    <section className="watch-detail">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            {watch.symbol} <span>/</span> RESEARCH QUESTION
          </p>
          <h1>{watch.question}</h1>
        </div>
        <Button
          className="button small check-button"
          busy={busy || running}
          onClick={() => void action(() => check({ watchId }))}
        >
          {running ? (
            "Checking sources"
          ) : (
            <>
              <RefreshCw size={15} /> Check sources
            </>
          )}
        </Button>
      </div>
      <div className="watch-meta">
        <span>
          <Clock3 size={14} />
          {stamp(watch.lastCheckAt)}
        </span>
        <span>
          {events.length} saved finding{events.length === 1 ? "" : "s"}
        </span>
        <label className="daily-toggle">
          <input
            type="checkbox"
            checked={watch.dailyEnabled}
            disabled={busy}
            onChange={(e) =>
              void action(() => daily({ watchId, enabled: e.target.checked }))
            }
          />{" "}
          Daily checks
        </label>
      </div>
      {error && <Notice>{error}</Notice>}
      {running && (
        <div className="check-progress" role="status">
          <span className="pulse-line" />
          <div>
            <strong>
              {watch.lastCheckState === "queued"
                ? "Your research check is queued."
                : "Reading official company disclosures."}
            </strong>
            <p>
              We are capturing source text and checking the evidence against
              your question. You can leave this page; the check continues.
            </p>
          </div>
        </div>
      )}
      {!running && (newest?.state === "failed" || failedSources > 0) && (
        <Notice>
          {newest?.state === "failed"
            ? "The latest check couldn't complete. "
            : `${failedSources} source${failedSources === 1 ? "" : "s"} couldn't be read. `}
          {newest?.message ?? "Open check history for details."} Your earlier
          evidence is preserved.
        </Notice>
      )}
      {!running &&
        newest?.state === "succeeded" &&
        newest.newEvents === 0 &&
        events.length > 0 && (
          <p className="quiet-status">
            <Check size={15} /> Latest check: no new evidence was added.
          </p>
        )}
      {watch.latestAnswer && (
        <div className="current-reading">
          <div>
            <span className="label">LATEST RESEARCH READING</span>
            <span className={`reading ${watch.latestStatus ?? "unclear"}`}>
              {readings[watch.latestStatus ?? "unclear"]}
            </span>
          </div>
          <p>{watch.latestAnswer}</p>
          <small>
            An AI interpretation of captured disclosures. Review the source
            evidence below.
          </small>
        </div>
      )}
      <div className="evidence-columns">
        <div className="evidence-timeline">
          <div className="timeline-heading">
            <h2>Evidence timeline</h2>
            <span>Newest captured first</span>
          </div>
          {events.length === 0 ? (
            <div className="empty-evidence">
              <BookOpen size={28} />
              <h3>
                {running
                  ? "Your first evidence is on its way."
                  : "No grounded findings yet."}
              </h3>
              <p>
                {running
                  ? "Findings will appear here as the check completes."
                  : "A check only adds a finding when its quotations can be found in the captured source. Inspect check history or try a more specific question."}
              </p>
            </div>
          ) : (
            events.map((event) => (
              <article className="evidence-event" key={event._id}>
                <div className="event-topline">
                  <span>
                    {event.eventDate ?? "Event date not stated"}{" "}
                    <span className="kind-label">
                      / {event.kind.replaceAll("_", " ")}
                    </span>
                  </span>
                  <span className={`reading ${event.status}`}>
                    {readings[event.status]}
                  </span>
                </div>
                <h3>{event.title}</h3>
                <p className="event-answer">{event.answer}</p>
                {event.citations.map((citation, i) => {
                  const snapshot = snapshots.find(
                    (s) => s._id === citation.snapshotId,
                  );
                  return (
                    <div
                      className="citation"
                      key={`${citation.snapshotId}-${i}`}
                    >
                      <span className="label">
                        <FileText size={14} /> SOURCE {i + 1}
                      </span>
                      <blockquote>“{citation.quote}”</blockquote>
                      {snapshot && (
                        <button
                          className="source-link"
                          onClick={() => setSource(snapshot)}
                        >
                          {snapshot.label}
                          <ArrowUpRight size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <footer className="event-footer">
                  <span>First captured {stamp(event.firstSeenAt)}</span>
                  {event.dateEvidence && (
                    <details>
                      <summary>Date evidence</summary>
                      <p>{event.dateEvidence}</p>
                    </details>
                  )}
                </footer>
              </article>
            ))
          )}
        </div>
        <aside className="research-aside">
          <section className="source-shelf">
            <h3>Source shelf</h3>
            <p>Saved text, as captured during your checks.</p>
            {snapshots.slice(0, 6).map((snapshot) => (
              <button key={snapshot._id} onClick={() => setSource(snapshot)}>
                <FileText size={16} />
                <span>
                  {snapshot.label}
                  <small>{stamp(snapshot.fetchedAt)}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
            {snapshots.length === 0 && (
              <span className="muted">No source snapshots yet.</span>
            )}
          </section>
          <section className="check-history">
            <h3>Check history</h3>
            {recentChecks.map((check) => (
              <details key={check._id}>
                <summary>
                  <span className={`check-dot ${check.state}`} />
                  <span>
                    {check.state === "succeeded"
                      ? "Check complete"
                      : check.state === "failed"
                        ? "Check incomplete"
                        : "Check in progress"}
                    <small>{stamp(check._creationTime)}</small>
                  </span>
                  <ChevronRight size={13} />
                </summary>
                <div>
                  <p>
                    {check.newEvents} new finding
                    {check.newEvents === 1 ? "" : "s"} · {check.sourceCount}{" "}
                    source{check.sourceCount === 1 ? "" : "s"}
                  </p>
                  {check.message && <p>{check.message}</p>}
                  {check.sourceResults.map((s) => (
                    <p className="source-result" key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.label}
                      </a>
                      <span>{s.state}</span>
                      {s.message && <small>{s.message}</small>}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </section>
          <Notifications watchId={watchId} />
          <p className="scope-note">
            Selected official company sources. No live prices, option-chain data
            or buy/sell recommendations.
          </p>
          <button
            className="text-button archive-button"
            onClick={() => setArchiveConfirm(true)}
          >
            Archive this question
          </button>
          {archiveConfirm && (
            <div className="archive-confirm">
              <p>
                Archive this question and stop future checks? Its records remain
                stored, but it leaves your active workspace.
              </p>
              <div>
                <Button
                  busy={busy}
                  onClick={() =>
                    void action(async () => {
                      await archive({ watchId });
                      onArchive();
                    })
                  }
                >
                  Archive
                </Button>
                <button onClick={() => setArchiveConfirm(false)}>
                  Keep question
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
      {source && (
        <SourceDialog snapshot={source} onClose={() => setSource(null)} />
      )}
    </section>
  );
}

function Notifications({ watchId }: { watchId: Id<"watches"> }) {
  const status = useQuery(api.notifications.status, { watchId });
  const request = useAction(api.notifications.requestVerification);
  const verify = useMutation(api.notifications.verify);
  const enable = useMutation(api.notifications.setEnabled).withOptimisticUpdate(
    (store, { watchId, enabled }) => {
      const status = store.getQuery(api.notifications.status, { watchId });
      if (status)
        store.setQuery(
          api.notifications.status,
          { watchId },
          { ...status, enabled },
        );
    },
  );
  const retry = useMutation(api.notifications.retry);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === false
      ) {
        throw new Error(
          "message" in result
            ? String(result.message)
            : "The request could not complete. Please try again.",
        );
      }
      if (result && typeof result === "object" && "message" in result)
        setMessage(String(result.message));
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  if (!status) return null;
  return (
    <section className="notification-settings">
      <h3>
        <Bell size={14} /> Email updates
      </h3>
      {!status.configured && (
        <p>
          Email delivery is temporarily unavailable. Your research checks
          continue in this workspace.
        </p>
      )}
      {!status.verified ? (
        status.configured && (
          <>
            <p>Verify {status.email} before enabling alerts.</p>
            {(status.verification?.state === "sent" ||
              status.verification?.state === "failed") && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() => verify({ code }));
                }}
              >
                <label htmlFor="email-code">8-digit verification code</label>
                <input
                  id="email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{8}"
                  maxLength={8}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <Button className="mini-button" busy={busy}>
                  Verify email
                </Button>
              </form>
            )}
            <Button
              className="text-button"
              busy={busy}
              onClick={() => void act(() => request({}))}
            >
              {status.verification?.state === "sent"
                ? "Send a new code"
                : "Send verification code"}
            </Button>
            {status.verification?.error && <p>{status.verification.error}</p>}
          </>
        )
      ) : (
        <>
          <label className="notification-toggle">
            <input
              type="checkbox"
              checked={!!status.enabled}
              disabled={busy || (!status.configured && !status.enabled)}
              onChange={(e) =>
                void act(() => enable({ watchId, enabled: e.target.checked }))
              }
            />
            <span>Email me new evidence for this question</span>
          </label>
          <p>Only new findings after you opt in. Sent to {status.email}.</p>
          {status.delivery && (
            <p className="delivery-state">
              {status.delivery.state === "sent"
                ? `Last alert sent ${stamp(status.delivery.sentAt)}`
                : `Latest alert: ${status.delivery.state}`}
              {status.delivery.error && <span>{status.delivery.error}</span>}
            </p>
          )}
          {status.delivery?.canRetry && (
            <Button
              className="text-button"
              busy={busy}
              onClick={() => void act(() => retry({ watchId }))}
            >
              Retry alert delivery
            </Button>
          )}
        </>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function SourceDialog({
  snapshot,
  onClose,
}: {
  snapshot: Doc<"snapshots">;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    el?.showModal();
    return () => {
      el?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="source-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="source-title"
    >
      <div className="source-dialog-content">
        <header>
          <div>
            <p className="eyebrow">SAVED SOURCE SNAPSHOT</p>
            <h2 id="source-title">{snapshot.label}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close source"
          >
            <X size={20} />
          </button>
        </header>
        <p className="snapshot-time">Captured {stamp(snapshot.fetchedAt)}</p>
        <a
          className="source-original"
          href={snapshot.url}
          target="_blank"
          rel="noreferrer"
        >
          Open original company page <ExternalLink size={14} />
        </a>
        <details className="snapshot-integrity">
          <summary>Snapshot details</summary>
          <p>
            SHA-256: <code>{snapshot.contentHash}</code>
          </p>
          <p>
            The captured text is limited to 24,000 characters per page. It may
            be an excerpt of the original document.
          </p>
        </details>
        <pre>{snapshot.content}</pre>
      </div>
    </dialog>
  );
}
export default App;
