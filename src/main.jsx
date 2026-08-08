import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Briefcase,
  Bot,
  FileText,
  LayoutDashboard,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Download,
  CheckCircle2,
  Settings,
  Save,
  ListChecks,
  MessageSquare,
  BadgeCheck,
  CircleDollarSign,
  Infinity as InfinityIcon,
  List,
  Columns3,
  Users,
  User,
  ChevronRight,
  RefreshCcw,
  Medal,
} from "lucide-react";
import "./styles.css";
import { parseCsv } from "./csv.js";
import jobHuntrLogo from "./jobhuntr-logo.png";

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
};
function App() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("overview");
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [err, setErr] = useState("");
  const load = () =>
    api("/api/state")
      .then(setState)
      .catch((e) => setErr(e.message));
  useEffect(load, []);
  const tabs = [
    ["overview", LayoutDashboard, "Overview", "primary"],
    ["agent", InfinityIcon, "Infinite Hunting", "automation"],
    ["queue", ListChecks, "Submission Queue", "automation"],
    ["board", Briefcase, "Job Board", "automation"],
    ["runs", List, "All Runs", "automation"],
    ["resume", Sparkles, "ATS Resume", "documents"],
    ["cover-letter", FileText, "Cover Letter", "documents"],
    ["tracker", Columns3, "Job Tracker", "career"],
    ["outreach", Users, "Outreach", "career"],
    ["audit", Search, "LinkedIn Audit", "career"],
    ["gigs", CircleDollarSign, "Gigs", "career"],
    ["coach", MessageSquare, "AI Coach", "career"],
  ];
  if (!state)
    return (
      <div className="splash">
        <Sparkles /> Loading local JobHuntr…
      </div>
    );
  return (
    <div className={sidebarHovered ? "app sidebar-open" : "app"}>
      {state.profile.onboarded === false && (
        <Onboarding profile={state.profile} reload={load} />
      )}
      <aside
        aria-label="JobHuntr navigation"
        className={
          sidebarHovered ? "v2-sidebar expanded" : "v2-sidebar collapsed"
        }
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="brand">
          <img className="logo-image" src={jobHuntrLogo} alt="JobHuntr" />
          <b>JobHuntr</b>
        </div>
        <nav className="v2-nav">
          {tabs.map(([name, Icon, label, group], index) => (
            <div className="v2-nav-slot" key={name}>
              {index > 0 && tabs[index - 1][3] !== group && (
                <div className="v2-divider" />
              )}
              <button
                title={label}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                <Icon size={16} />
                <span>{label}</span>
                {name === "queue" &&
                  state.submissions.filter((x) =>
                    ["draft", "ready"].includes(x.status),
                  ).length > 0 && (
                    <em>
                      {
                        state.submissions.filter((x) =>
                          ["draft", "ready"].includes(x.status),
                        ).length
                      }
                    </em>
                  )}
              </button>
            </div>
          ))}
        </nav>
        <div className="v2-user">
          <button
            onClick={() => setTab("settings")}
            className={tab === "settings" ? "active" : ""}
            title="Profile and settings"
            aria-current={tab === "settings" ? "page" : undefined}
          >
            <span className="v2-avatar">
              <User size={15} />
            </span>
            <span className="v2-user-copy">
              <b>{state.profile.name}</b>
              <small>Local workspace</small>
            </span>
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setTab("privacy")}
            className="v2-settings"
            title="Data and privacy"
            aria-current={tab === "privacy" ? "page" : undefined}
          >
            <Settings size={16} />
            <span>Settings & data</span>
          </button>
        </div>
      </aside>
      <main>
        <header
          className={
            [
              "overview",
              "queue",
              "runs",
              "resume",
              "cover-letter",
              "tracker",
              "agent",
              "board",
              "outreach",
              "audit",
              "gigs",
              "coach",
              "settings",
              "privacy",
            ].includes(tab)
              ? "integrated-page-header"
              : ""
          }
        >
          <div>
            <h1>{title(tab)}</h1>
            <p>{subtitle(tab)}</p>
          </div>
          <button onClick={load}>Refresh</button>
        </header>
        {err && <div className="error">{err}</div>}
        {tab === "overview" && (
          <Overview state={state} setTab={setTab} reload={load} />
        )}{" "}
        {tab === "tracker" && <Tracker state={state} reload={load} />}{" "}
        {tab === "board" && <Board reload={load} />}{" "}
        {tab === "queue" && <Queue state={state} reload={load} />}{" "}
        {tab === "resume" && <Resume state={state} reload={load} />}{" "}
        {tab === "coach" && <Coach state={state} reload={load} />}{" "}
        {tab === "audit" && <ProfileAudit state={state} reload={load} />}
        {tab === "gigs" && <Gigs state={state} reload={load} />}
        {tab === "agent" && (
          <Agent state={state} reload={load} setTab={setTab} />
        )}{" "}
        {tab === "runs" && <RunsPage state={state} setTab={setTab} />}
        {tab === "cover-letter" && (
          <Resume state={state} reload={load} mode="cover-letter" />
        )}
        {tab === "outreach" && <OutreachPage state={state} reload={load} />}
        {tab === "settings" && (
          <SettingsPage state={state} reload={load} />
        )}{" "}
        {tab === "privacy" && <Privacy />}
      </main>
    </div>
  );
}
function Onboarding({ profile, reload }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    role: profile.targetRoles?.[0] || "Software Engineer",
    skills: (profile.skills || []).join(", "),
    remote: true,
  });
  const finish = async () => {
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        onboarded: true,
        name: form.name || "Local Job Hunter",
        targetRoles: [form.role].filter(Boolean),
        skills: form.skills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        preferences: { ...profile.preferences, remote: form.remote },
      }),
    });
    reload();
  };
  return (
    <div className="modal-backdrop">
      <div className="onboarding">
        {step === 0 && (
          <>
            <img
              className="v2-onboarding-logo"
              src={jobHuntrLogo}
              alt="JobHuntr"
            />
            <span className="eyebrow">WELCOME TO JOBHUNTR</span>
            <h2>Your job search stays yours.</h2>
            <p>
              No signup, telemetry, hosted database, or required AI key.
              Everything is saved to this computer and can be exported anytime.
            </p>
            <button onClick={() => setStep(1)}>Set up my workspace</button>
            <button className="text-button" onClick={finish}>
              Use demo profile
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <span className="eyebrow">STEP 1 OF 2</span>
            <h2>What are you looking for?</h2>
            <label>
              Your name
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </label>
            <label>
              Primary target role
              <input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </label>
            <button onClick={() => setStep(2)}>Continue</button>
          </>
        )}
        {step === 2 && (
          <>
            <span className="eyebrow">STEP 2 OF 2</span>
            <h2>Personalize local matching</h2>
            <label>
              Skills, comma-separated
              <textarea
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.remote}
                onChange={(e) => setForm({ ...form, remote: e.target.checked })}
              />{" "}
              Include remote jobs
            </label>
            <button onClick={finish}>Open my command center</button>
          </>
        )}
      </div>
    </div>
  );
}
function title(t) {
  return {
    overview: "Command center",
    tracker: "Application tracker",
    board: "Local job board",
    queue: "Submission queue",
    resume: "Resume studio",
    coach: "Interview coach",
    audit: "Professional profile audit",
    gigs: "Freelance gigs",
    agent: "Autonomous hunt",
    runs: "All Runs",
    "cover-letter": "Cover Letter",
    outreach: "Outreach",
    settings: "Profile & preferences",
    privacy: "Privacy & safety",
  }[t];
}
function subtitle(t) {
  return {
    overview: "Your saved roles, pipeline health, tasks, and agent activity.",
    tracker:
      "Track every lead from interested to offer with notes and next steps.",
    board: "Search bundled demo roles or add listings manually.",
    queue: "Review application packets before marking them submitted.",
    resume:
      "Create versions, score ATS alignment, and draft cover letters offline.",
    coach: "Prepare interview questions, talking points, and outreach locally.",
    audit:
      "Paste your profile sections for a deterministic, private quality review.",
    agent: "Run a transparent local workflow using your preferences.",
    runs: "Monitor current workflows and review completed hunting sessions.",
    "cover-letter":
      "Create and edit tailored letters for tracked opportunities.",
    outreach:
      "Prepare recruiter and hiring-manager messages grounded in your profile.",
    settings: "Control the profile and criteria used for matching.",
    privacy: "Back up and restore a workspace with no cloud dependency.",
  }[t];
}
function Overview({ state, setTab, reload }) {
  const [refreshing, setRefreshing] = useState(false);
  const [farewellOpen, setFarewellOpen] = useState(false);
  const [chartVisibility, setChartVisibility] = useState({
    evaluated: true,
    queued: true,
  });
  const [chartHover, setChartHover] = useState(null);
  const farewellCloseRef = useRef(null);
  useEffect(() => {
    if (!farewellOpen) return undefined;
    farewellCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFarewellOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [farewellOpen]);
  const s = state.summary;
  const firstName = (state.profile.name || "there").split(" ")[0];
  const submitted = s.byStatus.applied || 0;
  const interviews = (s.byStatus.interview || 0) + (s.byStatus.offer || 0);
  const collected = s.totalJobs;
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft = monthEnd.getDate() - now.getDate();
  const contributorName = state.profile.name || "Local job hunter";
  const contributorInitials = contributorName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() - (6 - index));
    const through = date.getTime();
    const available = state.jobs.filter(
      (job) => new Date(job.createdAt || job.updatedAt).getTime() <= through,
    );
    return {
      date,
      evaluated: available.length,
      queued: available.filter((job) => job.status !== "rejected").length,
    };
  });
  const chartWidth = 720;
  const chartHeight = 260;
  const chartPaddingX = 48;
  const chartPaddingY = 32;
  const visibleSeries = Object.keys(chartVisibility).filter(
    (key) => chartVisibility[key],
  );
  const chartMax = Math.max(
    1,
    ...chartData.flatMap((point) => [point.evaluated, point.queued]),
  );
  const chartPoint = (index, value) => ({
    x:
      chartPaddingX +
      (index / Math.max(chartData.length - 1, 1)) *
        (chartWidth - chartPaddingX * 2),
    y:
      chartPaddingY +
      (1 - value / chartMax) * (chartHeight - chartPaddingY * 2),
  });
  const chartPath = (key) =>
    chartData
      .map((point, index) => {
        const coordinate = chartPoint(index, point[key]);
        return `${index ? "L" : "M"}${coordinate.x},${coordinate.y}`;
      })
      .join(" ");
  const updateChartHover = (event) => {
    if (!visibleSeries.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width),
    );
    setChartHover(Math.round(ratio * (chartData.length - 1)));
  };
  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };
  const exitJobHuntr = () => {
    window.close();
    window.setTimeout(() => {
      window.location.href = "about:blank";
    }, 120);
  };
  return (
    <section className="v2-overview">
      <div className="v2-overview-hero">
        <div className="v2-overview-hero-content">
          <div>
            <p className="v2-eyebrow">THIS WEEK&apos;S DASHBOARD</p>
            <h2>Welcome back, {firstName}</h2>
            <p>
              Track your pipeline, pick up where you left off, and keep momentum
              without hopping between tabs.
            </p>
          </div>
          <div className="v2-hero-actions">
            <button
              className="secondary"
              disabled={!state.agentRuns.length}
              onClick={() => setTab("runs")}
            >
              <List size={16} /> Open latest run
            </button>
            <button onClick={() => setTab("agent")}>
              <InfinityIcon size={16} /> Start Infinite Hunt
            </button>
          </div>
        </div>
        <div className="v2-overview-hero-meta">
          <span>JobHuntr is ready to help you find job opportunities.</span>
          <button
            className="v2-overview-refresh"
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCcw size={15} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
      <div className="v2-momentum">
        <span>MOMENTUM REMINDER</span>
        <b>Every focused application is one step closer to the right role.</b>
      </div>
      <div className="v2-overview-top">
        <div className="v2-kpi-grid">
          <div className="v2-kpi">
            <strong>{collected}</strong>
            <b>Total collected jobs</b>
            <span>Let&apos;s get more!</span>
          </div>
          <div className="v2-kpi">
            <strong>{submitted}</strong>
            <b>Total submitted</b>
            <span>{s.applicationsThisWeek} sent this week</span>
          </div>
          <div className="v2-kpi">
            <strong>{interviews}</strong>
            <b>Total interviews</b>
            <span>Celebrations so far</span>
          </div>
        </div>
        <div className="v2-overview-card v2-chart-card">
          <div className="v2-card-head">
            <div>
              <h3>Pipeline over time</h3>
              <p>From your first application to today.</p>
            </div>
            <div
              className="v2-chart-toggles"
              role="group"
              aria-label="Toggle chart lines"
            >
              {[
                ["evaluated", "Applications evaluated", "purple"],
                ["queued", "Jobs queued+", "cyan"],
              ].map(([key, label, color]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={chartVisibility[key]}
                    onChange={() =>
                      setChartVisibility((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                  />
                  <i className={color} /> {label}
                </label>
              ))}
            </div>
          </div>
          <div
            className="v2-chart"
            onPointerMove={updateChartHover}
            onPointerLeave={() => setChartHover(null)}
          >
            <div className="v2-chart-y-labels" aria-hidden="true">
              {[chartMax, Math.round(chartMax / 2), 0].map((value, index) => (
                <span key={`${value}-${index}`}>{value}</span>
              ))}
            </div>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Application progress over the last seven days"
            >
              {[0, 1, 2, 3, 4].map((index) => {
                const y =
                  chartPaddingY +
                  ((chartHeight - chartPaddingY * 2) / 4) * index;
                return (
                  <line
                    className="gridline"
                    key={index}
                    x1={chartPaddingX}
                    x2={chartWidth - chartPaddingX}
                    y1={y}
                    y2={y}
                  />
                );
              })}
              {visibleSeries.map((key) => (
                <path className={`line ${key}`} d={chartPath(key)} key={key} />
              ))}
              {chartHover !== null && visibleSeries.length > 0 && (
                <line
                  className="hoverline"
                  x1={chartPoint(chartHover, 0).x}
                  x2={chartPoint(chartHover, 0).x}
                  y1={chartPaddingY}
                  y2={chartHeight - chartPaddingY}
                />
              )}
            </svg>
            <div className="v2-chart-x-labels" aria-hidden="true">
              <span>
                {chartData[0].date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span>
                {chartData.at(-1).date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            {chartHover !== null && (
              <div
                className="v2-chart-tooltip"
                role="status"
                style={{
                  left: `${Math.max(8, Math.min(92, (chartHover / 6) * 100))}%`,
                }}
              >
                <b>
                  {chartData[chartHover].date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </b>
                {visibleSeries.map((key) => (
                  <span key={key}>
                    {key === "evaluated"
                      ? "Applications evaluated"
                      : "Jobs queued+"}
                    <strong>{chartData[chartHover][key]}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="v2-overview-columns single">
        <div className="v2-overview-card v2-contributors-card">
          <div className="v2-card-head">
            <div>
              <h3>Top Contributors of {monthLabel}</h3>
              <p>Top 1 winner will get one month free max plan</p>
              {daysLeft > 0 && (
                <small>
                  {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                </small>
              )}
            </div>
          </div>
          <div className="v2-contributor-list">
            <div className="v2-contributor-row">
              <span
                className="v2-contributor-rank"
                role="img"
                aria-label="Rank 1"
              >
                <Medal size={18} />
              </span>
              <span className="v2-contributor-avatar">
                {contributorInitials || "JH"}
              </span>
              <span className="v2-contributor-copy">
                <b>
                  {contributorName} <em>(You)</em>
                </b>
                <small>
                  {collected} {collected === 1 ? "job" : "jobs"} contributed
                </small>
              </span>
            </div>
          </div>
        </div>
      </div>
      <button
        className="v2-farewell-button"
        onClick={() => setFarewellOpen(true)}
      >
        I got an offer, bye 👋
      </button>
      {farewellOpen && (
        <div
          className="v2-farewell-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="farewell-title"
        >
          <button
            className="v2-farewell-backdrop"
            aria-label="Close congratulations dialog"
            onClick={() => setFarewellOpen(false)}
          />
          <div className="v2-farewell-content">
            <h3 id="farewell-title">Congrats!</h3>
            <p>
              This app was born to be deleted. We&apos;re so happy to hear you
              found your next opportunity—and goodbye!
            </p>
            <div className="v2-farewell-actions">
              <button
                ref={farewellCloseRef}
                className="secondary"
                onClick={() => setFarewellOpen(false)}
              >
                Oops—bring me back
              </button>
              <button onClick={exitJobHuntr}>Bye</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function Tracker({ state, reload }) {
  const stages = [
    "saved",
    "interested",
    "applied",
    "interview",
    "offer",
    "rejected",
  ];
  const [form, setForm] = useState({
    company: "",
    title: "",
    location: "Remote",
    url: "",
    salary: "",
    description: "",
    tags: "",
  });
  const [selected, setSelected] = useState(state.jobs[0]?.id);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("board");
  const [showForm, setShowForm] = useState(false);
  const job = state.jobs.find((item) => item.id === selected);
  const filtered = state.jobs.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const haystack =
      `${item.company} ${item.title} ${item.location} ${(item.tags || []).join(" ")}`.toLowerCase();
    return matchesStatus && haystack.includes(query.toLowerCase());
  });
  const patch = async (id, body) => {
    await api(`/api/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await reload();
  };
  const save = async () => {
    if (!form.company.trim() || !form.title.trim()) return;
    const created = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        tags: form.tags
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    });
    setForm({
      company: "",
      title: "",
      location: "Remote",
      url: "",
      salary: "",
      description: "",
      tags: "",
    });
    setSelected(created.id);
    setShowForm(false);
    await reload();
  };
  const remove = async () => {
    if (!job || !confirm(`Delete ${job.title} at ${job.company}?`)) return;
    await api(`/api/jobs/${job.id}`, { method: "DELETE" });
    setSelected(null);
    await reload();
  };
  return (
    <section className="tracker-page">
      <div className="v2-tracker-header">
        <h2>Job Tracker</h2>
        <div>
          <span>{filtered.length} applications</span>
          <button className="secondary" onClick={() => setMode("board")}>
            Funnel Analysis
          </button>
          <a className="button secondary" href="/api/export/jobs.csv">
            <Download size={15} /> Export CSV
          </a>
        </div>
      </div>
      <div className="tracker-toolbar card">
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Search tracked jobs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, role, location, or tag"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All stages</option>
          {stages.map((s) => (
            <option value={s} key={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button
            className={mode === "board" ? "active" : ""}
            onClick={() => setMode("board")}
          >
            Board
          </button>
          <button
            className={mode === "list" ? "active" : ""}
            onClick={() => setMode("list")}
          >
            List
          </button>
        </div>
        <button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add role
        </button>
      </div>
      {showForm && (
        <div className="card add-panel">
          <div className="row">
            <h3>Add a tracked role</h3>
            <button className="text-button" onClick={() => setShowForm(false)}>
              Close
            </button>
          </div>
          <div className="form-grid">
            {["company", "title", "location", "url", "salary", "tags"].map(
              (key) => (
                <label key={key}>
                  {key}
                  <input
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ),
            )}
          </div>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <button
            disabled={!form.company.trim() || !form.title.trim()}
            onClick={save}
          >
            Save role
          </button>
        </div>
      )}
      <div
        className={job ? "tracker-workspace with-detail" : "tracker-workspace"}
      >
        {mode === "board" ? (
          <div className="kanban">
            {stages.map((stage) => (
              <div
                className="kanban-column"
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  patch(e.dataTransfer.getData("jobId"), { status: stage })
                }
              >
                <div className="column-title">
                  <b>{stage}</b>
                  <span>
                    {filtered.filter((item) => item.status === stage).length}
                  </span>
                </div>
                {filtered
                  .filter((item) => item.status === stage)
                  .map((item) => (
                    <button
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("jobId", item.id)
                      }
                      onClick={() => setSelected(item.id)}
                      className={`kanban-card ${item.id === selected ? "selected" : ""}`}
                      key={item.id}
                    >
                      <div className="fit-ring">{item.fitScore}</div>
                      <b>{item.title}</b>
                      <span>{item.company}</span>
                      <small>{item.location || "Location not set"}</small>
                      {item.tasks?.some((t) => !t.done) && (
                        <em>
                          {item.tasks.filter((t) => !t.done).length} open
                          task(s)
                        </em>
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="card tracker-list">
            <div className="list-head">
              <span>Role</span>
              <span>Stage</span>
              <span>Fit</span>
              <span>Updated</span>
            </div>
            {filtered.map((item) => (
              <button key={item.id} onClick={() => setSelected(item.id)}>
                <span>
                  <b>{item.title}</b>
                  <small>
                    {item.company} · {item.location}
                  </small>
                </span>
                <span className={`pill ${item.status}`}>{item.status}</span>
                <strong>{item.fitScore}%</strong>
                <time>{new Date(item.updatedAt).toLocaleDateString()}</time>
              </button>
            ))}
          </div>
        )}
        {job && (
          <div className="job-drawer">
            <div className="row">
              <span className={`pill ${job.status}`}>{job.status}</span>
              <button
                className="drawer-close"
                aria-label="Close gig details"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <h2>{job.title}</h2>
            <p className="muted">
              {job.company} · {job.location} · {job.salary}
            </p>
            <select
              aria-label="Job status"
              value={job.status}
              onChange={(e) => patch(job.id, { status: e.target.value })}
            >
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {job.url && (
              <a href={job.url} target="_blank" rel="noreferrer">
                Open job listing ↗
              </a>
            )}
            <p>{job.description || "No description saved."}</p>
            <div className="chips">
              {(job.tags || []).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <Actions job={job} reload={reload} />
            <h3>Status timeline</h3>
            <div className="status-history">
              {(job.statusHistory || []).map((event, index) => (
                <p key={`${event.at}-${index}`}>
                  <b>{event.status}</b>
                  <small>{new Date(event.at).toLocaleString()}</small>
                </p>
              ))}
            </div>
            <button className="danger" onClick={remove}>
              Delete role
            </button>
          </div>
        )}
      </div>
      {!filtered.length && (
        <div className="card empty-state">
          <Search />
          <h3>No matching roles</h3>
          <p>Try a different filter or add a new opportunity.</p>
        </div>
      )}
    </section>
  );
}
function Actions({ job, reload }) {
  const [note, setNote] = useState("");
  const [task, setTask] = useState("Follow up with recruiter");
  const [taskDue, setTaskDue] = useState("");
  const [contact, setContact] = useState({
    name: "",
    role: "Recruiter",
    email: "",
  });
  return (
    <div className="job-actions">
      <h3>Notes</h3>
      <div className="inline">
        <input
          aria-label="Private job note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a private note"
        />
        <button
          disabled={!note.trim()}
          onClick={async () => {
            await api(`/api/jobs/${job.id}/notes`, {
              method: "POST",
              body: JSON.stringify({ text: note }),
            });
            setNote("");
            reload();
          }}
        >
          Save
        </button>
      </div>
      {(job.notes || []).map((n) => (
        <p className="note" key={n.id}>
          {n.text}
          <small>{new Date(n.at).toLocaleString()}</small>
        </p>
      ))}
      <h3>Tasks</h3>
      <div className="task-compose">
        <input
          aria-label="Task description"
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <input
          type="date"
          aria-label="Task due date"
          value={taskDue}
          onChange={(e) => setTaskDue(e.target.value)}
        />
        <button
          disabled={!task.trim()}
          onClick={async () => {
            await api(`/api/jobs/${job.id}/tasks`, {
              method: "POST",
              body: JSON.stringify({ text: task, due: taskDue }),
            });
            setTask("");
            setTaskDue("");
            reload();
          }}
        >
          Add
        </button>
      </div>
      {(job.tasks || []).map((t) => (
        <div className="task-row" key={t.id}>
          <label className="check">
            <input
              type="checkbox"
              checked={t.done}
              onChange={async (e) => {
                await api(`/api/jobs/${job.id}/tasks/${t.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ done: e.target.checked }),
                });
                reload();
              }}
            />
            <span>
              {t.text}
              {t.due && (
                <small>
                  Due {new Date(`${t.due}T12:00:00`).toLocaleDateString()}
                </small>
              )}
            </span>
          </label>
          <button
            className="icon danger"
            aria-label={`Delete task ${t.text}`}
            onClick={async () => {
              await api(`/api/jobs/${job.id}/tasks/${t.id}`, {
                method: "DELETE",
              });
              reload();
            }}
          >
            ×
          </button>
        </div>
      ))}
      <h3>Contacts</h3>
      <div className="contact-form">
        <input
          placeholder="Name"
          value={contact.name}
          onChange={(e) => setContact({ ...contact, name: e.target.value })}
        />
        <input
          placeholder="Role"
          value={contact.role}
          onChange={(e) => setContact({ ...contact, role: e.target.value })}
        />
        <input
          placeholder="Email"
          value={contact.email}
          onChange={(e) => setContact({ ...contact, email: e.target.value })}
        />
      </div>
      <button
        disabled={!contact.name.trim()}
        onClick={async () => {
          await api(`/api/jobs/${job.id}/contacts`, {
            method: "POST",
            body: JSON.stringify(contact),
          });
          setContact({ name: "", role: "Recruiter", email: "" });
          reload();
        }}
      >
        Add contact
      </button>
      {(job.contacts || []).map((c) => (
        <p className="contact" key={c.id}>
          <b>{c.name}</b> · {c.role}
          <small>{c.email}</small>
        </p>
      ))}
    </div>
  );
}
function Board({ reload }) {
  const [q, setQ] = useState("engineer");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const search = async () =>
    setResults(
      await api("/api/board/search", {
        method: "POST",
        body: JSON.stringify({ q }),
      }),
    );
  useEffect(() => {
    api("/api/board/search", {
      method: "POST",
      body: JSON.stringify({ q: "engineer" }),
    }).then(setResults);
  }, []);
  const selected = results[selectedIndex] || results[0];
  return (
    <section className="v2-board-page">
      <div className="v2-board-header">
        <span className="eyebrow">COMMUNITY JOB FEED</span>
        <div className="v2-page-intro">
          <div>
            <h2>Today's Picks</h2>
            <p>
              {results.length} fresh jobs from the local demo catalog. Add one
              to your queue before it's gone.
            </p>
          </div>
          <button className="secondary" onClick={search}>
            Refresh now
          </button>
        </div>
      </div>
      <div className="v2-board-search">
        <Search size={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search role, skill, company"
        />
        <button onClick={search}>Search</button>
      </div>
      <div className="v2-board-layout">
        <div className="v2-board-list">
          {results.map((j, i) => (
            <button
              type="button"
              className={`v2-board-row ${selectedIndex === i ? "selected" : ""}`}
              key={`${j.url}-${i}`}
              onClick={() => setSelectedIndex(i)}
            >
              <span className="v2-job-logo">{j.company?.slice(0, 1)}</span>
              <span>
                <strong>{j.title}</strong>
                <small>
                  {j.company} · {j.location}
                </small>
                <em>{j.fitScore}% match</em>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        {selected && (
          <article className="card v2-board-detail">
            <div className="v2-board-detail-top">
              <span className="v2-job-logo large">
                {selected.company?.slice(0, 1)}
              </span>
              <div>
                <h3>{selected.title}</h3>
                <p>
                  {selected.company} · {selected.location}
                </p>
              </div>
              <span className="v2-match-pill">{selected.fitScore}% match</span>
            </div>
            <div className="v2-job-facts">
              <span>Full-time</span>
              <span>Recently added</span>
              <span>Community sourced</span>
            </div>
            <h4>About the role</h4>
            <p>{selected.description}</p>
            <h4>Why it matches</h4>
            <ul>
              <li>Matches your target role and saved preferences</li>
              <li>Relevant skills found in your JobHuntr profile</li>
            </ul>
            <button
              onClick={async () => {
                await api("/api/jobs", {
                  method: "POST",
                  body: JSON.stringify(selected),
                });
                reload();
              }}
            >
              <Plus size={16} /> Add to job tracker
            </button>
          </article>
        )}
      </div>
    </section>
  );
}
function Queue({ state, reload }) {
  const [jobId, setJobId] = useState(
    state.jobs.find((j) => !["applied", "rejected"].includes(j.status))?.id ||
      "",
  );
  const [selectedId, setSelectedId] = useState(
    state.submissions.find(
      (item) => !["archived", "submitted"].includes(item.status),
    )?.id || "",
  );
  const [query, setQuery] = useState("");
  const [queueTab, setQueueTab] = useState("apply");
  const [sourceSelectedId, setSourceSelectedId] = useState("");
  const active = state.submissions.filter(
    (item) => !["archived", "submitted"].includes(item.status),
  );
  const filtered = active.filter((item) => {
    const job = state.jobs.find((candidate) => candidate.id === item.jobId);
    return `${job?.title || ""} ${job?.company || ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  const selected = active.find((item) => item.id === selectedId) || filtered[0];
  const queuedJobIds = new Set(active.map((item) => item.jobId));
  const sourceJobs = state.jobs.filter((job) => {
    if (
      queuedJobIds.has(job.id) ||
      ["applied", "rejected"].includes(job.status)
    )
      return false;
    const isManual = ["manual", "import", "csv import"].includes(
      String(job.source || "").toLowerCase(),
    );
    return queueTab === "manual" ? isManual : !isManual;
  });
  const visibleSourceJobs = sourceJobs.filter((job) =>
    `${job.title} ${job.company} ${job.location}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const sourceSelected =
    visibleSourceJobs.find((job) => job.id === sourceSelectedId) ||
    visibleSourceJobs[0];
  const create = async () => {
    const created = await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        jobId,
        resumeId: state.resumes[0]?.id || "",
        coverLetterId:
          state.coverLetters.find((x) => x.jobId === jobId)?.id || "",
      }),
    });
    setSelectedId(created.id);
    await reload();
  };
  const prepareJob = async (targetJobId) => {
    const created = await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        jobId: targetJobId,
        resumeId: state.resumes[0]?.id || "",
        coverLetterId:
          state.coverLetters.find((item) => item.jobId === targetJobId)?.id ||
          "",
      }),
    });
    setSelectedId(created.id);
    setJobId(targetJobId);
    setQueueTab("apply");
    await reload();
  };
  return (
    <section className="v2-queue-page">
      <div className="v2-queue-title-row">
        <div>
          <h2>Submission Queue</h2>
          <p>
            Review collected jobs, attachments, and application details before
            submitting.
          </p>
        </div>
        <button className="secondary" onClick={reload}>
          Refresh
        </button>
      </div>
      <div className="v2-queue-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={queueTab === "apply"}
          className={queueTab === "apply" ? "active" : ""}
          onClick={() => setQueueTab("apply")}
        >
          <ClipboardListIcon /> Apply Jobs <em>{active.length}</em>
        </button>
        <button
          role="tab"
          aria-selected={queueTab === "search"}
          className={queueTab === "search" ? "active" : ""}
          onClick={() => setQueueTab("search")}
        >
          <Search size={15} /> Search Jobs{" "}
          <em>
            {
              state.jobs.filter(
                (job) =>
                  !queuedJobIds.has(job.id) &&
                  !["manual", "import", "csv import"].includes(
                    String(job.source || "").toLowerCase(),
                  ),
              ).length
            }
          </em>
        </button>
        <button
          role="tab"
          aria-selected={queueTab === "manual"}
          className={queueTab === "manual" ? "active" : ""}
          onClick={() => setQueueTab("manual")}
        >
          <Plus size={15} /> Manual Jobs{" "}
          <em>
            {
              state.jobs.filter(
                (job) =>
                  !queuedJobIds.has(job.id) &&
                  ["manual", "import", "csv import"].includes(
                    String(job.source || "").toLowerCase(),
                  ),
              ).length
            }
          </em>
        </button>
      </div>
      {queueTab !== "apply" ? (
        <>
          <div className="v2-queue-toolbar">
            <div className="searchbox">
              <Search size={16} />
              <input
                aria-label={`Search ${queueTab} jobs`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search jobs or companies"
              />
            </div>
          </div>
          <div className="v2-queue-layout">
            <div className="v2-queue-list">
              <div className="v2-queue-list-head">
                <span>{visibleSourceJobs.length} jobs</span>
                <span>Source</span>
              </div>
              {visibleSourceJobs.map((job) => (
                <button
                  key={job.id}
                  className={sourceSelected?.id === job.id ? "selected" : ""}
                  onClick={() => setSourceSelectedId(job.id)}
                >
                  <span className="v2-job-logo">
                    {(job.company || "J").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="v2-queue-job-copy">
                    <b>{job.title}</b>
                    <small>{job.company}</small>
                    <em>{job.fitScore || 0}% match</em>
                  </span>
                  <time>{job.source || "Manual"}</time>
                </button>
              ))}
              {!visibleSourceJobs.length && (
                <div className="v2-queue-empty">
                  <InboxIcon />
                  <h3>
                    {queueTab === "search"
                      ? "No search-only jobs"
                      : "No manually added jobs"}
                  </h3>
                  <p>Matching jobs from this workflow will appear here.</p>
                </div>
              )}
            </div>
            <div className="v2-queue-detail">
              {sourceSelected ? (
                <div className="v2-source-job-detail">
                  <span className="pill">{sourceSelected.source}</span>
                  <h2>{sourceSelected.title}</h2>
                  <p className="muted">
                    {sourceSelected.company} · {sourceSelected.location}
                  </p>
                  <p>{sourceSelected.description}</p>
                  <div className="chips">
                    {(sourceSelected.tags || []).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <button onClick={() => prepareJob(sourceSelected.id)}>
                    <FileText size={16} /> Prepare application
                  </button>
                </div>
              ) : (
                <div className="v2-detail-empty">
                  <Briefcase />
                  <h3>Select a job</h3>
                  <p>Job details and application actions will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="v2-queue-toolbar">
            <div className="searchbox">
              <Search size={16} />
              <input
                aria-label="Search submission queue"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jobs or companies"
              />
            </div>
            <div className="v2-create-packet">
              <select
                aria-label="Tracked role"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                {state.jobs
                  .filter((j) => !["applied", "rejected"].includes(j.status))
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.company} — {j.title}
                    </option>
                  ))}
              </select>
              <button disabled={!jobId} onClick={create}>
                <Plus size={15} /> Add to queue
              </button>
            </div>
          </div>
          <div className="v2-queue-layout">
            <div className="v2-queue-list">
              <div className="v2-queue-list-head">
                <span>{filtered.length} jobs</span>
                <span>Queue time</span>
              </div>
              {filtered.map((item) => {
                const job = state.jobs.find(
                  (candidate) => candidate.id === item.jobId,
                );
                return (
                  <button
                    key={item.id}
                    className={selected?.id === item.id ? "selected" : ""}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="v2-job-logo">
                      {(job?.company || "J").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="v2-queued-job">
                      <b>{job?.title || "Missing role"}</b>
                      <small>
                        {job?.company} ·{" "}
                        {job?.location || "Location unavailable"}
                      </small>
                      <span>
                        <i className={`queue-state ${item.status}`} />
                        {item.status}
                        <em>{job?.fitScore || 0}% match</em>
                      </span>
                    </span>
                    <time>{new Date(item.createdAt).toLocaleDateString()}</time>
                  </button>
                );
              })}
              {!filtered.length && (
                <div className="v2-queue-empty">
                  <InboxIcon />
                  <h3>Your queue is clear</h3>
                  <p>Add a tracked role to review its application packet.</p>
                </div>
              )}
            </div>
            <div className="v2-queue-detail">
              {selected ? (
                <SubmissionCard
                  submission={selected}
                  state={state}
                  reload={reload}
                />
              ) : (
                <div className="v2-detail-empty">
                  <ClipboardListIcon />
                  <h3>Select a job to review</h3>
                  <p>Application details and attachments will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
function ClipboardListIcon() {
  return <ListChecks size={15} />;
}
function InboxIcon() {
  return <Download size={24} />;
}
function SubmissionCard({ submission: s, state, reload }) {
  const job = state.jobs.find((j) => j.id === s.jobId);
  const updateChecklist = async (id, done) => {
    const checklist = s.checklist.map((x) =>
      x.id === id ? { ...x, done } : x,
    );
    await api(`/api/submissions/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        checklist,
        status: checklist.every((x) => x.done) ? "ready" : "draft",
      }),
    });
    reload();
  };
  return (
    <div className="packet">
      <div className="row">
        <div>
          <b>{job?.title || "Missing role"}</b>
          <small>
            {job?.company} · {s.status}
          </small>
        </div>
        <span className={`pill ${s.status}`}>{s.status}</span>
      </div>
      {s.checklist.map((item) => (
        <label className="check" key={item.id}>
          <input
            type="checkbox"
            checked={item.done}
            onChange={(e) => updateChecklist(item.id, e.target.checked)}
          />
          {item.text}
        </label>
      ))}
      <div className="attachments">
        <span>
          Resume:{" "}
          {state.resumes.find((r) => r.id === s.resumeId)?.name ||
            "not attached"}
        </span>
        <span>
          Cover letter:{" "}
          {state.coverLetters.find((c) => c.id === s.coverLetterId)?.title ||
            "not attached"}
        </span>
      </div>
      <button
        className="success"
        disabled={!s.checklist.every((x) => x.done)}
        onClick={async () => {
          await api(`/api/submissions/${s.id}/submit`, {
            method: "POST",
            body: "{}",
          });
          reload();
        }}
      >
        <CheckCircle2 size={16} /> Mark submitted
      </button>
    </div>
  );
}
function Resume({ state, reload, mode = "resume" }) {
  const resumeRef = useRef(null);
  const [resume, setResume] = useState(state.profile.resumeText);
  const [name, setName] = useState("Targeted resume");
  const [templateId, setTemplateId] = useState(
    state.templates?.[0]?.id || "clean-ats",
  );
  const [jobId, setJobId] = useState(state.jobs[0]?.id || "");
  const [score, setScore] = useState(null);
  const [letter, setLetter] = useState(state.coverLetters[0] || null);
  const [preview, setPreview] = useState(state.resumes[0] || null);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateSort, setTemplateSort] = useState("name");
  const [templateDialog, setTemplateDialog] = useState(null);
  const templateDialogCloseRef = useRef(null);
  const visibleTemplates = state.templates
    .filter((template) =>
      `${template.name} ${template.description}`
        .toLowerCase()
        .includes(templateQuery.toLowerCase()),
    )
    .sort((a, b) =>
      templateSort === "newest"
        ? new Date(b.updatedAt || b.createdAt || 0) -
          new Date(a.updatedAt || a.createdAt || 0)
        : a.name.localeCompare(b.name),
    );
  useEffect(() => {
    if (!templateDialog) return undefined;
    templateDialogCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setTemplateDialog(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [templateDialog]);
  const openTemplateDialog = (template = null) =>
    setTemplateDialog({
      id: template?.id || null,
      name: template?.name || "",
      description: template?.description || "",
      sections: (
        template?.sections || ["Summary", "Skills", "Experience", "Education"]
      ).join(", "),
    });
  const saveTemplate = async () => {
    const payload = {
      name: templateDialog.name,
      description: templateDialog.description,
      sections: templateDialog.sections
        .split(",")
        .map((section) => section.trim())
        .filter(Boolean),
    };
    const saved = await api(
      templateDialog.id
        ? `/api/templates/${templateDialog.id}`
        : "/api/templates",
      {
        method: templateDialog.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    setTemplateId(saved.id);
    setTemplateDialog(null);
    await reload();
  };
  const saveResume = async () => {
    const content = resumeRef.current?.value ?? resume;
    setResume(content);
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ resumeText: content }),
    });
    const saved = await api("/api/resumes", {
      method: "POST",
      body: JSON.stringify({ name, templateId, content }),
    });
    setPreview(saved);
    await reload();
  };
  const generateLetter = async () => {
    const created = await api("/api/cover-letters", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    });
    setLetter(created);
    await reload();
  };
  const saveLetter = async () => {
    if (!letter) return;
    const saved = await api(`/api/cover-letters/${letter.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: letter.title, body: letter.body }),
    });
    setLetter(saved);
    await reload();
  };
  if (mode === "cover-letter") {
    return (
      <section className="v2-document-page">
        <div className="v2-document-page-head">
          <div>
            <h2>Cover Letters</h2>
            <p>
              {state.coverLetters.length} cover letter
              {state.coverLetters.length === 1 ? "" : "s"} available
            </p>
          </div>
          <div className="v2-document-actions">
            <select
              aria-label="Cover letter target job"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              {state.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.title}
                </option>
              ))}
            </select>
            <button onClick={generateLetter}>
              <Plus size={16} /> Create Cover Letter
            </button>
          </div>
        </div>
        <div className="v2-cover-layout">
          <div className="v2-template-grid">
            {state.coverLetters.map((item) => (
              <button
                key={item.id}
                className={letter?.id === item.id ? "selected" : ""}
                onClick={() => setLetter(item)}
              >
                <span className="v2-file-icon">
                  <FileText size={22} />
                </span>
                <span>
                  <b>{item.title}</b>
                  <small>
                    Updated{" "}
                    {new Date(
                      item.updatedAt || item.createdAt,
                    ).toLocaleDateString()}
                  </small>
                </span>
              </button>
            ))}
            {!state.coverLetters.length && (
              <div className="v2-document-empty">
                <FileText />
                <h3>No cover letters yet</h3>
                <p>
                  Select a tracked job and create your first reusable letter.
                </p>
              </div>
            )}
          </div>
          <div className="card v2-letter-workspace">
            {letter ? (
              <>
                <div className="row">
                  <h3>Edit Cover Letter</h3>
                  <a
                    href={`/print/cover-letter/${letter.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview PDF ↗
                  </a>
                </div>
                <input
                  aria-label="Cover letter title"
                  value={letter.title}
                  onChange={(e) =>
                    setLetter({ ...letter, title: e.target.value })
                  }
                />
                <textarea
                  aria-label="Cover letter content"
                  className="letter"
                  value={letter.body}
                  onChange={(e) =>
                    setLetter({ ...letter, body: e.target.value })
                  }
                />
                <div className="inline">
                  <button onClick={saveLetter}>
                    <Save size={16} /> Save changes
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      await api(`/api/cover-letters/${letter.id}`, {
                        method: "DELETE",
                      });
                      setLetter(null);
                      reload();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div className="v2-detail-empty">
                <FileText />
                <h3>Select a cover letter</h3>
                <p>Choose a saved letter to preview and edit its content.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="resume-studio">
      <div className="v2-ats-header">
        <div>
          <h2>ATS Resume</h2>
          <p>
            Create reusable templates and generate tailored resumes for each
            application.
          </p>
        </div>
        <span>
          {state.resumes.length} generated resume
          {state.resumes.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="v2-template-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Search resume templates"
            value={templateQuery}
            onChange={(event) => setTemplateQuery(event.target.value)}
            placeholder="Search templates"
          />
        </div>
        <select
          aria-label="Sort resume templates"
          value={templateSort}
          onChange={(event) => setTemplateSort(event.target.value)}
        >
          <option value="name">Name</option>
          <option value="newest">Newest</option>
        </select>
        <button onClick={() => openTemplateDialog()}>
          <Plus size={16} /> Create New
        </button>
      </div>
      <div className="v2-resume-templates">
        {visibleTemplates.map((template) => (
          <div
            key={template.id}
            className={templateId === template.id ? "selected" : ""}
          >
            <button
              className="v2-template-select"
              onClick={() => setTemplateId(template.id)}
            >
              <span className="v2-template-preview">
                <FileText size={26} />
                <i />
                <i />
                <i />
              </span>
              <span>
                <b>{template.name}</b>
                <small>{template.description}</small>
              </span>
            </button>
            <div className="v2-template-actions">
              <button
                className="text-button"
                aria-label={`Edit ${template.name} template`}
                onClick={() => openTemplateDialog(template)}
              >
                Edit
              </button>
              <button
                className="text-button danger"
                aria-label={`Delete ${template.name} template`}
                disabled={state.templates.length <= 1}
                onClick={async () => {
                  if (!window.confirm(`Delete “${template.name}”?`)) return;
                  await api(`/api/templates/${template.id}`, {
                    method: "DELETE",
                  });
                  if (templateId === template.id)
                    setTemplateId(
                      state.templates.find((item) => item.id !== template.id)
                        ?.id || "",
                    );
                  await reload();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!visibleTemplates.length && (
          <div className="v2-template-empty">
            <Search size={22} /> No templates match “{templateQuery}”.
          </div>
        )}
      </div>
      <div className="card resume-editor">
        <div className="row">
          <h3>Resume editor</h3>
          <span className="pill">local draft</span>
        </div>
        <div className="triple">
          <input
            aria-label="Resume version name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Version name"
          />
          <select
            aria-label="Resume template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {state.templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Target job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            {state.jobs.map((j) => (
              <option value={j.id} key={j.id}>
                {j.company} — {j.title}
              </option>
            ))}
          </select>
        </div>
        <textarea
          aria-label="Resume content"
          ref={resumeRef}
          className="resume"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder={
            "SUMMARY\nYour concise positioning statement\n\nEXPERIENCE\n- Accomplished X, measured by Y"
          }
        />
        <div className="inline">
          <button onClick={saveResume}>
            <Save size={16} /> Save version
          </button>
          <button
            className="secondary"
            onClick={async () =>
              setScore(
                await api("/api/resume/score", {
                  method: "POST",
                  body: JSON.stringify({ resumeText: resume, jobId }),
                }),
              )
            }
          >
            Analyze ATS fit
          </button>
        </div>
        {score && (
          <div className="score">
            <b>{score.score}% ATS alignment</b>
            <p>
              {score.keywordHits.length} keywords matched ·{" "}
              {score.quantifiedBullets} quantified outcomes
            </p>
            {score.missingKeywords?.length > 0 && (
              <div className="chips">
                {score.missingKeywords.slice(0, 6).map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            )}
            {score.suggestions.map((s) => (
              <p key={s}>• {s}</p>
            ))}
          </div>
        )}
      </div>
      <div className="card document-library">
        <h3>Resume history</h3>
        {state.resumes.length ? (
          state.resumes.map((r) => (
            <div
              className={
                preview?.id === r.id ? "document-row selected" : "document-row"
              }
              key={r.id}
            >
              <button
                onClick={() => {
                  setPreview(r);
                  setResume(r.content);
                  setName(r.name);
                  setTemplateId(r.templateId);
                }}
              >
                <b>{r.name}</b>
                <small>
                  {state.templates.find((t) => t.id === r.templateId)?.name ||
                    r.templateId}{" "}
                  · {new Date(r.updatedAt).toLocaleDateString()}
                </small>
              </button>
              <a
                href={`/print/resume/${r.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Print
              </a>
              <button
                className="icon danger"
                title="Delete resume"
                onClick={async () => {
                  await api(`/api/resumes/${r.id}`, { method: "DELETE" });
                  if (preview?.id === r.id) setPreview(null);
                  reload();
                }}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <p className="empty">Save your first tailored version.</p>
        )}
      </div>
      {preview && (
        <div className="card document-preview">
          <div className="row">
            <h3>Print preview</h3>
            <a
              className="button"
              href={`/print/resume/${preview.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open / Save PDF
            </a>
          </div>
          <iframe
            title="Resume print preview"
            src={`/print/resume/${preview.id}`}
          />
        </div>
      )}
      {templateDialog && (
        <div
          className="v2-template-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-dialog-title"
        >
          <button
            className="v2-template-backdrop"
            aria-label="Close template editor"
            onClick={() => setTemplateDialog(null)}
          />
          <div className="v2-template-modal-content">
            <h3 id="template-dialog-title">
              {templateDialog.id ? "Edit Template" : "Create New Template"}
            </h3>
            <p>
              Define a reusable ATS-friendly structure for future resume
              versions.
            </p>
            <label>
              Template name
              <input
                value={templateDialog.name}
                onChange={(event) =>
                  setTemplateDialog({
                    ...templateDialog,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={templateDialog.description}
                onChange={(event) =>
                  setTemplateDialog({
                    ...templateDialog,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Sections (comma separated)
              <input
                value={templateDialog.sections}
                onChange={(event) =>
                  setTemplateDialog({
                    ...templateDialog,
                    sections: event.target.value,
                  })
                }
              />
            </label>
            <div className="v2-template-modal-actions">
              <button
                ref={templateDialogCloseRef}
                className="secondary"
                onClick={() => setTemplateDialog(null)}
              >
                Cancel
              </button>
              <button
                disabled={!templateDialog.name.trim()}
                onClick={saveTemplate}
              >
                <Save size={16} /> Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function OutreachPage({ state, reload }) {
  const [jobId, setJobId] = useState(state.jobs[0]?.id || "");
  const [selectedId, setSelectedId] = useState(
    state.outreachDrafts[0]?.id || "",
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [draft, setDraft] = useState(
    state.outreachDrafts.find((item) => item.id === selectedId) || null,
  );
  const generate = async () => {
    const created = await api("/api/outreach/draft", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    });
    setSelectedId(created.id);
    setDraft(created);
    await reload();
  };
  const visible = state.outreachDrafts.filter((item) => {
    const job = state.jobs.find((candidate) => candidate.id === item.jobId);
    return (
      (status === "all" || (item.status || "draft") === status) &&
      `${item.subject} ${job?.company || ""} ${job?.title || ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const selected =
    draft || visible.find((item) => item.id === selectedId) || visible[0];
  return (
    <section className="v2-outreach-page">
      <div className="v2-page-intro">
        <div>
          <h2>Outreach</h2>
          <p>
            Build relationships with recruiters, hiring managers, and peers
            connected to your saved roles.
          </p>
        </div>
        <div className="inline">
          <select
            aria-label="Role for outreach"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            {state.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.company} — {job.title}
              </option>
            ))}
          </select>
          <button disabled={!jobId} onClick={generate}>
            <Users size={16} /> Collect contacts
          </button>
        </div>
      </div>
      <div className="v2-outreach-stats">
        <div>
          <span>Total contacts</span>
          <strong>{state.outreachDrafts.length}</strong>
        </div>
        <div>
          <span>Ready to contact</span>
          <strong>
            {
              state.outreachDrafts.filter(
                (item) => (item.status || "draft") === "draft",
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Outreached</span>
          <strong>
            {
              state.outreachDrafts.filter((item) => item.status === "sent")
                .length
            }
          </strong>
        </div>
      </div>
      <div className="v2-outreach-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts, companies, or roles"
          />
        </div>
        <select
          aria-label="Filter contacts by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="draft">Listed</option>
          <option value="sent">Outreached</option>
        </select>
      </div>
      <div className="v2-outreach-layout">
        <div className="card v2-contact-table">
          <div className="v2-contact-head">
            <span>Contact</span>
            <span>Company & role</span>
            <span>Status</span>
          </div>
          {visible.length ? (
            visible.map((item) => {
              const job = state.jobs.find(
                (candidate) => candidate.id === item.jobId,
              );
              return (
                <button
                  className={selected?.id === item.id ? "selected" : ""}
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setDraft(item);
                  }}
                >
                  <span className="v2-contact-avatar">
                    {(job?.company || "C")[0]}
                  </span>
                  <span>
                    <strong>{item.recipient || "Hiring team"}</strong>
                    <small>{item.subject}</small>
                  </span>
                  <span>
                    <strong>{job?.company || "Deleted role"}</strong>
                    <small>{job?.title}</small>
                  </span>
                  <em>{item.status === "sent" ? "Outreached" : "Listed"}</em>
                </button>
              );
            })
          ) : (
            <div className="empty-state">
              <Users />
              <h3>No contacts collected yet</h3>
              <p>
                Choose a tracked role and collect a private, editable outreach
                draft.
              </p>
            </div>
          )}
        </div>
        <div className="card v2-contact-detail">
          {selected ? (
            <>
              <div className="v2-contact-profile">
                <span className="v2-contact-avatar large">
                  {
                    (state.jobs.find((job) => job.id === selected.jobId)
                      ?.company || "C")[0]
                  }
                </span>
                <div>
                  <h3>{selected.recipient || "Hiring team"}</h3>
                  <p>
                    {
                      state.jobs.find((job) => job.id === selected.jobId)
                        ?.company
                    }{" "}
                    ·{" "}
                    {state.jobs.find((job) => job.id === selected.jobId)?.title}
                  </p>
                </div>
              </div>
              <OutreachEditor
                draft={selected}
                setDraft={setDraft}
                reload={reload}
              />
            </>
          ) : (
            <div className="empty-state">
              <MessageSquare />
              <h3>Select a contact</h3>
              <p>
                Contact details and your personalized message will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
function Coach({ state, reload }) {
  const [view, setView] = useState("chat");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("jobhuntr-coach-chat") || "[]");
    } catch {
      return [];
    }
  });
  const [jobId, setJobId] = useState(
    state.jobs.find((j) => j.status === "interview")?.id ||
      state.jobs[0]?.id ||
      "",
  );
  const [session, setSession] = useState(state.coachingSessions[0] || null);
  const [draft, setDraft] = useState(state.outreachDrafts[0] || null);
  const prepare = async () => {
    const created = await api("/api/coach/prepare", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    });
    setSession(created);
    await reload();
  };
  const generateOutreach = async () => {
    const created = await api("/api/outreach/draft", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    });
    setDraft(created);
    await reload();
  };
  const sendCoachMessage = (message = chatInput) => {
    const prompt = message.trim();
    if (!prompt) return;
    const role =
      state.jobs.find((job) => job.id === jobId)?.title ||
      state.profile.targetRoles?.[0] ||
      "your target role";
    const skills = (state.profile.skills || []).slice(0, 3).join(", ");
    const answer = `For ${role}, start by grounding your answer in one specific outcome. Use a short situation-action-result structure${skills ? ` and connect it to ${skills}` : ""}. Next, quantify the result and finish by explaining how that experience applies to this opportunity.`;
    const next = [
      ...messages,
      { role: "user", content: prompt },
      { role: "assistant", content: answer },
    ];
    setMessages(next);
    localStorage.setItem("jobhuntr-coach-chat", JSON.stringify(next));
    setChatInput("");
  };
  return (
    <section className="coach-page">
      <div className="card coach-toolbar">
        <div className="segmented">
          <button
            className={view === "chat" ? "active" : ""}
            onClick={() => setView("chat")}
          >
            AI Career Coach
          </button>
          <button
            className={view === "practice" ? "active" : ""}
            onClick={() => setView("practice")}
          >
            Interview practice
          </button>
          <button
            className={view === "stories" ? "active" : ""}
            onClick={() => setView("stories")}
          >
            STAR story vault
          </button>
          <button
            className={view === "outreach" ? "active" : ""}
            onClick={() => setView("outreach")}
          >
            Outreach
          </button>
        </div>
        <select
          aria-label="Coaching role"
          value={jobId}
          onChange={(e) => {
            setJobId(e.target.value);
            setSession(null);
            setDraft(null);
          }}
        >
          {state.jobs.map((job) => (
            <option value={job.id} key={job.id}>
              {job.company} — {job.title}
            </option>
          ))}
        </select>
      </div>
      {view === "chat" && (
        <div className="v2-coach-chat card">
          <div className="v2-coach-messages">
            {messages.length === 0 ? (
              <div className="v2-coach-welcome">
                <div className="v2-coach-avatar">
                  <Sparkles size={24} />
                </div>
                <h2>Hi, I'm AI Coach!</h2>
                <p>
                  I'm your private and personal career coach. I can help you
                  sharpen your story, prepare for interviews, and decide what to
                  do next.
                </p>
                <strong>How can I help you today?</strong>
                <div className="v2-coach-prompts">
                  {[
                    "Help me prepare for an interview",
                    "Improve my career story",
                    "What should I prioritize this week?",
                  ].map((prompt) => (
                    <button
                      className="secondary"
                      key={prompt}
                      onClick={() => sendCoachMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  className={`v2-chat-message ${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  {message.role === "assistant" && (
                    <span className="v2-mini-coach">
                      <Sparkles size={14} />
                    </span>
                  )}
                  <p>{message.content}</p>
                </div>
              ))
            )}
          </div>
          <div className="v2-coach-input">
            <textarea
              aria-label="Message AI Coach"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendCoachMessage();
                }
              }}
              placeholder="Ask about your job search, interviews, or next career move…"
            />
            <button
              disabled={!chatInput.trim()}
              onClick={() => sendCoachMessage()}
            >
              Get Started <ChevronRight size={17} />
            </button>
          </div>
          <small className="v2-coach-disclaimer">
            Private local guidance. Review important career decisions yourself.
          </small>
        </div>
      )}
      {view === "practice" && (
        <div className="coach-layout">
          <div className="card coach-sidebar">
            <h3>Interview sessions</h3>
            <button onClick={prepare}>
              <MessageSquare size={16} /> New role-specific plan
            </button>
            {state.coachingSessions.map((item) => {
              const job = state.jobs.find((x) => x.id === item.jobId);
              return (
                <button
                  className={
                    session?.id === item.id
                      ? "session-row selected"
                      : "session-row"
                  }
                  key={item.id}
                  onClick={() => setSession(item)}
                >
                  <b>{job?.company || "Deleted role"}</b>
                  <span>{job?.title}</span>
                  <small>
                    {item.status} ·{" "}
                    {new Date(
                      item.updatedAt || item.createdAt,
                    ).toLocaleDateString()}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="card">
            {session ? (
              <PracticeSession
                session={session}
                setSession={setSession}
                state={state}
                reload={reload}
              />
            ) : (
              <div className="empty-state">
                <MessageSquare />
                <h3>Build a private practice plan</h3>
                <p>
                  Answers, research progress, and notes are persisted only on
                  this device.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {view === "stories" && (
        <StoryVault stories={state.careerStories} reload={reload} />
      )}{" "}
      {view === "outreach" && (
        <div className="coach-layout">
          <div className="card coach-sidebar">
            <h3>Outreach drafts</h3>
            <button onClick={generateOutreach}>
              <Sparkles size={16} /> Draft for selected role
            </button>
            {state.outreachDrafts.map((item) => {
              const job = state.jobs.find((x) => x.id === item.jobId);
              return (
                <button
                  className={
                    draft?.id === item.id
                      ? "session-row selected"
                      : "session-row"
                  }
                  key={item.id}
                  onClick={() => setDraft(item)}
                >
                  <b>{item.subject}</b>
                  <span>{job?.company}</span>
                  <small>
                    {item.status || "draft"} ·{" "}
                    {new Date(
                      item.updatedAt || item.createdAt,
                    ).toLocaleDateString()}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="card">
            {draft ? (
              <OutreachEditor
                draft={draft}
                setDraft={setDraft}
                reload={reload}
              />
            ) : (
              <div className="empty-state">
                <Sparkles />
                <h3>Create an editable outreach draft</h3>
                <p>
                  JobHuntr never sends messages. You stay in control of external
                  actions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function PracticeSession({ session, setSession, state, reload }) {
  const job = state.jobs.find((x) => x.id === session.jobId);
  const stories = (session.matchedStoryIds || [])
    .map((id) => state.careerStories.find((x) => x.id === id))
    .filter(Boolean);
  const save = async (status = session.status) => {
    const updated = await api(`/api/coach/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        answers: session.answers,
        notes: session.notes,
        researchDone: session.researchDone,
        status,
      }),
    });
    setSession(updated);
    await reload();
  };
  return (
    <div className="practice">
      <div className="row">
        <div>
          <span className="eyebrow">{job?.company}</span>
          <h2>{job?.title}</h2>
        </div>
        <span className={`pill ${session.status}`}>{session.status}</span>
      </div>
      {stories.length > 0 && (
        <div className="story-suggestions">
          <b>Relevant STAR evidence</b>
          {stories.map((story) => (
            <details key={story.id}>
              <summary>{story.title}</summary>
              <p>
                <b>Action:</b> {story.action}
              </p>
              <p>
                <b>Result:</b> {story.result}
              </p>
            </details>
          ))}
        </div>
      )}
      <h3>Practice questions</h3>
      {session.questions.map((question, index) => (
        <label className="practice-question" key={question}>
          <b>
            {index + 1}. {question}
          </b>
          <textarea
            value={session.answers?.[question] || ""}
            onChange={(e) =>
              setSession({
                ...session,
                answers: { ...session.answers, [question]: e.target.value },
              })
            }
            placeholder="Write a concise answer with specific evidence…"
          />
        </label>
      ))}
      <h3>Research checklist</h3>
      {session.companyResearch.map((item) => (
        <label className="check task" key={item}>
          <input
            type="checkbox"
            checked={(session.researchDone || []).includes(item)}
            onChange={(e) =>
              setSession({
                ...session,
                researchDone: e.target.checked
                  ? [...(session.researchDone || []), item]
                  : (session.researchDone || []).filter((x) => x !== item),
              })
            }
          />
          {item}
        </label>
      ))}
      <h3>Private notes</h3>
      <textarea
        value={session.notes || ""}
        onChange={(e) => setSession({ ...session, notes: e.target.value })}
        placeholder="Questions to ask, interviewer names, follow-up notes…"
      />
      <div className="inline">
        <button onClick={() => save("in-progress")}>
          <Save size={16} /> Save progress
        </button>
        <button className="success" onClick={() => save("completed")}>
          <CheckCircle2 size={16} /> Mark prepared
        </button>
      </div>
    </div>
  );
}
function StoryVault({ stories, reload }) {
  const empty = {
    title: "",
    situation: "",
    task: "",
    action: "",
    result: "",
    skills: "",
  };
  const [form, setForm] = useState(empty);
  const [selected, setSelected] = useState(null);
  const edit = (story) => {
    setSelected(story.id);
    setForm({ ...story, skills: (story.skills || []).join(", ") });
  };
  const save = async () => {
    const body = {
      ...form,
      skills: form.skills
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    if (selected)
      await api(`/api/career-stories/${selected}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    else
      await api("/api/career-stories", {
        method: "POST",
        body: JSON.stringify(body),
      });
    setSelected(null);
    setForm(empty);
    await reload();
  };
  return (
    <div className="story-layout">
      <div className="card">
        <div className="row">
          <h3>{selected ? "Edit STAR story" : "Add STAR story"}</h3>
          {selected && (
            <button
              className="text-button"
              onClick={() => {
                setSelected(null);
                setForm(empty);
              }}
            >
              New
            </button>
          )}
        </div>
        <label>
          Story title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Improved onboarding conversion 24%"
          />
        </label>
        {[
          ["situation", "Situation"],
          ["task", "Task"],
          ["action", "Action"],
          ["result", "Result"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Skills, comma-separated
          <input
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
          />
        </label>
        <button disabled={!form.title.trim()} onClick={save}>
          <Save size={16} /> {selected ? "Save changes" : "Save story"}
        </button>
      </div>
      <div className="card">
        <h3>Your evidence library · {stories.length}</h3>
        {stories.length ? (
          stories.map((story) => (
            <div className="story-card" key={story.id}>
              <button onClick={() => edit(story)}>
                <b>{story.title}</b>
                <span>{(story.skills || []).join(" · ")}</span>
                <p>
                  {story.result || story.action || "Add a measurable result."}
                </p>
              </button>
              <button
                className="danger"
                onClick={async () => {
                  await api(`/api/career-stories/${story.id}`, {
                    method: "DELETE",
                  });
                  reload();
                }}
              >
                Delete
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Sparkles />
            <h3>Capture reusable proof</h3>
            <p>
              STAR stories make interview plans and outreach grounded in your
              real experience.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
function OutreachEditor({ draft, setDraft, reload }) {
  const save = async (status = draft.status || "draft") => {
    const updated = await api(`/api/outreach/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        subject: draft.subject,
        body: draft.body,
        status,
      }),
    });
    setDraft(updated);
    await reload();
  };
  return (
    <div>
      <div className="row">
        <h3>Edit outreach</h3>
        <select
          aria-label="Outreach status"
          value={draft.status || "draft"}
          onChange={(e) => {
            setDraft({ ...draft, status: e.target.value });
            save(e.target.value);
          }}
        >
          {["draft", "sent", "replied", "archived"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <label>
        Subject
        <input
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
        />
      </label>
      <label>
        Message
        <textarea
          className="letter"
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </label>
      <button onClick={() => save()}>
        <Save size={16} /> Save locally
      </button>
      <p className="hint">
        Copy this draft into your preferred service manually. No message is sent
        by JobHuntr.
      </p>
    </div>
  );
}
function Gigs({ state, reload }) {
  const stages = [
    "lead",
    "proposal",
    "negotiation",
    "won",
    "in-progress",
    "completed",
    "lost",
  ];
  const empty = {
    client: "",
    title: "",
    source: "Manual",
    url: "",
    budget: 0,
    earned: 0,
    dueDate: "",
    description: "",
    proposal: "",
    status: "lead",
  };
  const [form, setForm] = useState(empty);
  const [selected, setSelected] = useState(state.gigs[0]?.id || null);
  const [showForm, setShowForm] = useState(false);
  const [gigQuery, setGigQuery] = useState("");
  const gig = state.gigs.find((item) => item.id === selected);
  const money = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  const save = async () => {
    const created = await api("/api/gigs", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setSelected(created.id);
    setForm(empty);
    setShowForm(false);
    await reload();
  };
  const patch = async (id, body) => {
    await api(`/api/gigs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await reload();
  };
  const availableGigs = [
    {
      client: "Career Tools Lab",
      title: "Review an AI resume workflow",
      budget: 175,
      description:
        "Test a career product workflow and deliver concise, evidence-based usability feedback.",
      skills: ["Product testing", "Writing"],
    },
    {
      client: "Launch Partners",
      title: "Create a technical product teardown",
      budget: 300,
      description:
        "Document a software onboarding journey and recommend the three highest-impact improvements.",
      skills: ["Research", "Product strategy"],
    },
    {
      client: "Developer Community",
      title: "Build a small React prototype",
      budget: 500,
      description:
        "Turn a focused product brief into a polished responsive prototype with clear handoff notes.",
      skills: ["React", "TypeScript"],
    },
  ].filter((item) =>
    `${item.title} ${item.client} ${item.description}`
      .toLowerCase()
      .includes(gigQuery.toLowerCase()),
  );
  const applyToGig = async (item) => {
    const created = await api("/api/gigs", {
      method: "POST",
      body: JSON.stringify({
        ...empty,
        client: item.client,
        title: item.title,
        budget: item.budget,
        description: item.description,
        source: "JobHuntr Gigs",
      }),
    });
    setSelected(created.id);
    await reload();
  };
  return (
    <section className="gigs-page">
      <div className="v2-page-intro v2-gigs-intro">
        <div>
          <h2>Gigs</h2>
          <p>
            All tasks listed here are designed for quick skill validation and
            fast earnings, typically completed within a few days.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add gig
        </button>
      </div>
      <div className="v2-available-gigs">
        <div className="v2-gigs-section-title">
          <div>
            <h3>Available Gigs</h3>
            <p>
              Short projects selected for fast skill validation and earnings.
            </p>
          </div>
        </div>
        <div className="searchbox v2-gig-search">
          <Search size={16} />
          <input
            aria-label="Search available gigs"
            value={gigQuery}
            onChange={(event) => setGigQuery(event.target.value)}
            placeholder="Search gigs by title, description, or partner…"
          />
        </div>
        <div className="v2-gig-campaigns">
          {availableGigs.map((item) => (
            <article className="card" key={item.title}>
              <div className="row">
                <span className="v2-gig-partner">{item.client[0]}</span>
                <strong>{money(item.budget)}</strong>
              </div>
              <h3>{item.title}</h3>
              <small>by {item.client}</small>
              <p>{item.description}</p>
              <div className="chips">
                {item.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <button onClick={() => applyToGig(item)}>View & apply</button>
            </article>
          ))}
        </div>
      </div>
      <div className="v2-gigs-section-title">
        <div>
          <h3>My Gigs</h3>
          <p>
            Track freelance opportunities, applications, delivery, and earnings
            locally.
          </p>
        </div>
      </div>
      <div className="gig-metrics">
        <div className="card metric">
          <span>ACTIVE GIGS</span>
          <strong>{state.summary.gigs.active}</strong>
          <small>{state.summary.gigs.total} total opportunities</small>
        </div>
        <div className="card metric">
          <span>PIPELINE VALUE</span>
          <strong>{money(state.summary.gigs.pipelineValue)}</strong>
          <small>lead through negotiation</small>
        </div>
        <div className="card metric">
          <span>TRACKED EARNINGS</span>
          <strong>{money(state.summary.gigs.earnings)}</strong>
          <small>won through completed</small>
        </div>
        <div className="card v2-gig-privacy">
          <ShieldCheck size={20} />
          <div>
            <strong>Private workspace</strong>
            <p className="hint">
              No marketplace account or external service required.
            </p>
          </div>
        </div>
      </div>
      {showForm && (
        <div className="card add-panel">
          <div className="row">
            <h3>Add freelance opportunity</h3>
            <button className="text-button" onClick={() => setShowForm(false)}>
              Close
            </button>
          </div>
          <div className="form-grid">
            {[
              ["client", "Client"],
              ["title", "Project title"],
              ["source", "Source"],
              ["url", "Listing URL"],
              ["budget", "Potential budget"],
              ["dueDate", "Deadline"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type={
                    key === "budget"
                      ? "number"
                      : key === "dueDate"
                        ? "date"
                        : "text"
                  }
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <button
            disabled={!form.client.trim() || !form.title.trim()}
            onClick={save}
          >
            Save gig
          </button>
        </div>
      )}
      <div className={gig ? "gig-workspace with-detail" : "gig-workspace"}>
        <div className="gig-board">
          {stages.map((stage) => (
            <div
              className="gig-column"
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) =>
                patch(e.dataTransfer.getData("gigId"), { status: stage })
              }
            >
              <div className="column-title">
                <b>{stage}</b>
                <span>
                  {state.gigs.filter((item) => item.status === stage).length}
                </span>
              </div>
              {state.gigs
                .filter((item) => item.status === stage)
                .map((item) => (
                  <button
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("gigId", item.id)
                    }
                    className={
                      item.id === selected ? "gig-card selected" : "gig-card"
                    }
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <b>{item.title}</b>
                    <span>{item.client}</span>
                    <strong>{money(item.budget)}</strong>
                    {item.dueDate && (
                      <small>
                        Due{" "}
                        {new Date(
                          `${item.dueDate}T12:00:00`,
                        ).toLocaleDateString()}
                      </small>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </div>
        {gig && (
          <div className="card gig-drawer">
            <div className="row">
              <span className={`pill ${gig.status}`}>{gig.status}</span>
              <button
                className="drawer-close"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <h2>{gig.title}</h2>
            <p className="muted">
              {gig.client} · {gig.source}
            </p>
            <select
              aria-label="Gig stage"
              value={gig.status}
              onChange={(e) => patch(gig.id, { status: e.target.value })}
            >
              {stages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
            {gig.url && (
              <a href={gig.url} target="_blank" rel="noreferrer">
                Open listing ↗
              </a>
            )}
            <div className="double">
              <label>
                Budget
                <input
                  type="number"
                  defaultValue={gig.budget}
                  onBlur={(e) =>
                    patch(gig.id, { budget: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Earned
                <input
                  type="number"
                  defaultValue={gig.earned}
                  onBlur={(e) =>
                    patch(gig.id, { earned: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              Deadline
              <input
                type="date"
                defaultValue={gig.dueDate || ""}
                onBlur={(e) => patch(gig.id, { dueDate: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                defaultValue={gig.description}
                onBlur={(e) => patch(gig.id, { description: e.target.value })}
              />
            </label>
            <label>
              Proposal / pitch
              <textarea
                className="gig-proposal"
                defaultValue={gig.proposal}
                onBlur={(e) => patch(gig.id, { proposal: e.target.value })}
                placeholder="Scope, approach, timeline, and evidence…"
              />
            </label>
            <h3>Status timeline</h3>
            <div className="status-history">
              {gig.statusHistory.map((event, index) => (
                <p key={`${event.at}-${index}`}>
                  <b>{event.status}</b>
                  <small>{new Date(event.at).toLocaleString()}</small>
                </p>
              ))}
            </div>
            <button
              className="danger"
              onClick={async () => {
                if (!confirm(`Delete ${gig.title}?`)) return;
                await api(`/api/gigs/${gig.id}`, { method: "DELETE" });
                setSelected(null);
                reload();
              }}
            >
              Delete gig
            </button>
          </div>
        )}
      </div>
      {!state.gigs.length && !showForm && (
        <div className="card empty-state">
          <CircleDollarSign />
          <h3>No gigs tracked</h3>
          <p>Add freelance leads without connecting a marketplace account.</p>
        </div>
      )}
    </section>
  );
}
function ProfileAudit({ state, reload }) {
  const [profileUrl, setProfileUrl] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [form, setForm] = useState({
    headline: state.profile.headline || "",
    about: "",
    experience: state.profile.resumeText || "",
    skills: (state.profile.skills || []).join(", "),
  });
  const [audit, setAudit] = useState(state.profileAudits[0] || null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      const result = await api("/api/profile-audits", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setAudit(result);
      await reload();
    } finally {
      setRunning(false);
    }
  };
  return (
    <section className="v2-audit-page">
      <div className="v2-page-intro">
        <div>
          <h2>LinkedIn Profile Audit</h2>
          <p>
            Review your profile positioning and receive comprehensive,
            evidence-based feedback.
          </p>
        </div>
      </div>
      <div className="v2-audit-url">
        <input
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/username"
        />
        <button disabled={running || !form.headline.trim()} onClick={run}>
          {running ? "Analyzing…" : "Analyze Profile"}
        </button>
      </div>
      <div className="v2-local-notice">
        <ShieldCheck size={18} />
        <span>
          <strong>Private local analysis</strong> JobHuntr does not open
          LinkedIn or transmit your content. Paste the sections you want
          reviewed below.
        </span>
      </div>
      <button
        className="v2-audit-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          {expanded ? "Hide" : "Show"} profile content and additional context
        </span>
        <ChevronRight className={expanded ? "rotated" : ""} size={18} />
      </button>
      <div className="audit-layout">
        {expanded && (
          <div className="card audit-form">
            <span className="eyebrow">PROFILE CONTENT</span>
            <label>
              Headline
              <input
                value={form.headline}
                maxLength="1000"
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                placeholder="Product engineer | AI workflows | Shipped 0→1 products"
              />
            </label>
            <label>
              About section
              <textarea
                value={form.about}
                onChange={(e) => setForm({ ...form, about: e.target.value })}
                placeholder="Your positioning, evidence, motivation, and call to action…"
              />
            </label>
            <label>
              Experience highlights
              <textarea
                className="audit-experience"
                value={form.experience}
                onChange={(e) =>
                  setForm({ ...form, experience: e.target.value })
                }
                placeholder="Paste representative experience bullets…"
              />
            </label>
            <label>
              Skills, comma-separated
              <input
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
              />
            </label>
            <button disabled={running || !form.headline.trim()} onClick={run}>
              <BadgeCheck size={16} />
              {running ? "Auditing…" : "Run private audit"}
            </button>
            <p className="hint">
              JobHuntr does not open LinkedIn, use cookies, or transmit this
              content.
            </p>
          </div>
        )}
        <div className="audit-results">
          {audit ? (
            <div className="card">
              <div className="audit-score">
                <div
                  className={`score-orb ${audit.total >= 75 ? "strong" : audit.total >= 50 ? "fair" : "weak"}`}
                >
                  <strong>{audit.total}</strong>
                  <span>/ 100</span>
                </div>
                <div>
                  <span className="eyebrow">PROFILE STRENGTH</span>
                  <h2>
                    {audit.total >= 75
                      ? "Strong foundation"
                      : audit.total >= 50
                        ? "Good start, with gaps"
                        : "Needs focused revision"}
                  </h2>
                  <p>
                    {audit.matchedTerms.length} target-role terms matched ·{" "}
                    {audit.metrics} quantified outcomes
                  </p>
                </div>
              </div>
              <div className="audit-checks">
                {audit.checks.map((check) => (
                  <div
                    className={`audit-check ${check.status}`}
                    key={check.section}
                  >
                    <div className="row">
                      <b>{check.section}</b>
                      <strong>{check.score}</strong>
                    </div>
                    <div className="mini-progress">
                      <i style={{ width: `${check.score}%` }} />
                    </div>
                    <p>{check.detail}</p>
                  </div>
                ))}
              </div>
              <h3>Prioritized recommendations</h3>
              {audit.suggestions.length ? (
                audit.suggestions.map((suggestion) => (
                  <p className="recommendation" key={suggestion}>
                    → {suggestion}
                  </p>
                ))
              ) : (
                <p className="success-message">
                  Every baseline check passed. Keep claims specific and current.
                </p>
              )}
              <h3>Matched positioning terms</h3>
              <div className="chips">
                {audit.matchedTerms.map((term) => (
                  <span key={term}>{term}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="card empty-state">
              <BadgeCheck />
              <h3>Get an inspectable score</h3>
              <p>
                No generative AI or hidden rubric. Every section score maps to
                visible evidence.
              </p>
            </div>
          )}
          <div className="card">
            <h3>Audit history · {state.profileAudits.length}</h3>
            {state.profileAudits.length ? (
              state.profileAudits.map((item) => (
                <div
                  className={
                    audit?.id === item.id
                      ? "audit-history selected"
                      : "audit-history"
                  }
                  key={item.id}
                >
                  <button
                    onClick={() => {
                      setAudit(item);
                      setForm({
                        ...item.input,
                        skills: Array.isArray(item.input.skills)
                          ? item.input.skills.join(", ")
                          : item.input.skills,
                      });
                    }}
                  >
                    <strong>{item.total}</strong>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    <small>{item.suggestions.length} recommendation(s)</small>
                  </button>
                  <button
                    className="danger"
                    aria-label="Delete profile audit"
                    onClick={async () => {
                      await api(`/api/profile-audits/${item.id}`, {
                        method: "DELETE",
                      });
                      if (audit?.id === item.id) setAudit(null);
                      reload();
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <p className="empty">No saved audits yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function Agent({ state, reload, setTab }) {
  const defaults = {
    q: state.profile.targetRoles?.[0] || "Software Engineer",
    location: state.profile.preferences?.locations?.[0] || "",
    minFit: 60,
    maxResults: 25,
    required: "",
    excluded: "",
  };
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [selectedRuns, setSelectedRuns] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("jobhuntr-infinite-workflows") || "null",
      );
      return Array.isArray(saved) && saved.length
        ? saved
        : ["linkedin", "indeed"];
    } catch {
      return ["linkedin", "indeed"];
    }
  });
  const [optimizeResume, setOptimizeResume] = useState(
    () => localStorage.getItem("jobhuntr-optimize-resume") === "true",
  );
  const [running, setRunning] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusCloseRef = useRef(null);
  const latestRun = state.agentRuns[0] || null;
  useEffect(() => {
    if (!statusOpen) return undefined;
    statusCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setStatusOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [statusOpen]);
  const payload = () => ({
    q: form.q,
    location: form.location,
    minFit: Number(form.minFit),
    maxResults: Number(form.maxResults),
    requiredKeywords: form.required
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    excludeKeywords: form.excluded
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    workflows: selectedRuns,
    optimizeResume,
  });
  const loadPreset = (preset) => {
    setForm({
      ...form,
      ...preset.options,
      required: (preset.options.requiredKeywords || []).join(", "),
      excluded: (preset.options.excludeKeywords || []).join(", "),
    });
    if (preset.options.workflows?.length)
      saveRunOrder(preset.options.workflows);
    if (preset.options.optimizeResume !== undefined) {
      setOptimizeResume(Boolean(preset.options.optimizeResume));
      localStorage.setItem(
        "jobhuntr-optimize-resume",
        String(Boolean(preset.options.optimizeResume)),
      );
    }
  };
  const run = async () => {
    setRunning(true);
    try {
      const result = await api("/api/agent-runs/start", {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      setPreview({
        matches: result.matches,
        inspected: result.inspected,
        alreadyTracked: result.duplicates,
        options: result.options,
        added: result.added,
      });
      await reload();
    } finally {
      setRunning(false);
    }
  };
  const workflows = [
    [
      "linkedin",
      "in",
      "LinkedIn Jobs",
      "Search jobs and prepare applications from LinkedIn.",
    ],
    ["indeed", "i", "Indeed", "Find matching roles across Indeed listings."],
    [
      "glassdoor",
      "g",
      "Glassdoor",
      "Discover roles using company and salary context.",
    ],
    [
      "company",
      "↗",
      "Company Career Page Search",
      "Search verified company career pages directly.",
    ],
  ];
  const saveRunOrder = (runs) => {
    setSelectedRuns(runs);
    localStorage.setItem("jobhuntr-infinite-workflows", JSON.stringify(runs));
  };
  const toggleRun = (id) =>
    saveRunOrder(
      selectedRuns.includes(id)
        ? selectedRuns.filter((runId) => runId !== id)
        : [...selectedRuns, id],
    );
  const moveRun = (index, offset) => {
    const destination = index + offset;
    if (destination < 0 || destination >= selectedRuns.length) return;
    const next = [...selectedRuns];
    [next[index], next[destination]] = [next[destination], next[index]];
    saveRunOrder(next);
  };
  return (
    <section className="v2-hunt-page">
      <div className="v2-page-intro v2-hunt-intro">
        <div>
          <h2>Infinite Hunting</h2>
          <p>
            Automatically create new runs to search and apply to jobs around the
            clock.
          </p>
        </div>
        {latestRun && (
          <button className="secondary" onClick={() => setStatusOpen(true)}>
            View last infinite session
          </button>
        )}
      </div>
      {state.queue?.length > 0 && (
        <div className="v2-queue-banner">
          <List size={20} />
          <span>
            You have {state.queue.length} queued job
            {state.queue.length === 1 ? "" : "s"} waiting to be reviewed
          </span>
          <button className="secondary" onClick={() => setTab("queue")}>
            View Submission Queue <ChevronRight size={15} />
          </button>
        </div>
      )}
      <div className="card v2-hunt-builder">
        <div className="v2-resume-source">
          <div className="v2-section-heading">
            <div className="v2-icon-tile">
              <FileText size={19} />
            </div>
            <div>
              <h3>Your resume</h3>
              <p>
                JobHuntr uses your profile and resume to evaluate every
                opportunity.
              </p>
            </div>
          </div>
          <div className="v2-resume-choice">
            <div>
              <strong>{state.profile.name || "Your JobHuntr profile"}</strong>
              <span>
                {state.profile.targetRoles?.join(" · ") ||
                  "Add target roles in settings"}
              </span>
            </div>
            <BadgeCheck size={20} />
          </div>
        </div>
        <div className="v2-ats-option">
          <label className="v2-check-row">
            <input
              type="checkbox"
              checked={optimizeResume}
              onChange={(e) => {
                setOptimizeResume(e.target.checked);
                localStorage.setItem(
                  "jobhuntr-optimize-resume",
                  String(e.target.checked),
                );
              }}
            />
            <span>
              <strong>Generate an optimized resume for each job</strong>
              <small>
                Create a tailored, ATS-friendly version before adding the
                application to your queue.
              </small>
            </span>
          </label>
        </div>
        <div className="v2-run-picker">
          <h3>Available runs</h3>
          <p>
            Select where JobHuntr should search. You can combine multiple runs
            in one infinite hunt.
          </p>
          <div className="v2-workflow-grid">
            {workflows.map(([id, mark, title, description]) => {
              const selected = selectedRuns.includes(id);
              return (
                <button
                  type="button"
                  className={`v2-workflow-card ${selected ? "selected" : ""}`}
                  key={id}
                  onClick={() => toggleRun(id)}
                >
                  <span className={`v2-platform-mark ${id}`}>{mark}</span>
                  <span className="v2-workflow-copy">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <span className="v2-workflow-check">
                    {selected ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="v2-selected-runs">
          <h3>Runs in infinite hunt loop</h3>
          <p>Selected runs execute in the order shown below.</p>
          <div className="v2-loop-box">
            {selectedRuns.length ? (
              selectedRuns.map((id, index) => {
                const workflow = workflows.find((item) => item[0] === id);
                return (
                  <div className="v2-loop-row" key={id}>
                    <b>{index + 1}</b>
                    <span className={`v2-platform-mark ${id}`}>
                      {workflow[1]}
                    </span>
                    <div>
                      <strong>{workflow[2]}</strong>
                      <small>Ready for local preview</small>
                    </div>
                    <span className="v2-loop-order-actions">
                      <button
                        className="text-button"
                        aria-label={`Move ${workflow[2]} up`}
                        disabled={index === 0}
                        onClick={() => moveRun(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="text-button"
                        aria-label={`Move ${workflow[2]} down`}
                        disabled={index === selectedRuns.length - 1}
                        onClick={() => moveRun(index, 1)}
                      >
                        ↓
                      </button>
                    </span>
                    <button
                      className="text-button"
                      onClick={() => toggleRun(id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="v2-loop-empty">
                Please select from available runs
              </div>
            )}
          </div>
        </div>
        <details className="v2-hunt-filters">
          <summary>Search preferences</summary>
          <div className="hunt-config-fields">
            <label>
              Role or keywords
              <input
                value={form.q}
                onChange={(e) => setForm({ ...form, q: e.target.value })}
                placeholder="Product engineer"
              />
            </label>
            <label>
              Location
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Remote or leave blank"
              />
            </label>
            <div className="double">
              <label>
                Required keywords
                <input
                  value={form.required}
                  onChange={(e) =>
                    setForm({ ...form, required: e.target.value })
                  }
                  placeholder="typescript, react"
                />
              </label>
              <label>
                Exclude keywords
                <input
                  value={form.excluded}
                  onChange={(e) =>
                    setForm({ ...form, excluded: e.target.value })
                  }
                  placeholder="senior, clearance"
                />
              </label>
            </div>
            <label>
              Minimum profile fit: <b>{form.minFit}%</b>
              <input
                type="range"
                min="30"
                max="95"
                value={form.minFit}
                onChange={(e) =>
                  setForm({ ...form, minFit: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Maximum results
              <select
                value={form.maxResults}
                onChange={(e) =>
                  setForm({ ...form, maxResults: Number(e.target.value) })
                }
              >
                {[5, 10, 25, 50].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <div className="v2-hunt-actions">
          <button
            className="secondary"
            onClick={async () =>
              setPreview(
                await api("/api/agent-runs/preview", {
                  method: "POST",
                  body: JSON.stringify(payload()),
                }),
              )
            }
          >
            Preview matches
          </button>
          <button disabled={running || selectedRuns.length === 0} onClick={run}>
            <InfinityIcon size={17} />
            {running ? "Starting infinite hunt…" : "Start infinite hunt"}
          </button>
        </div>
        <button
          className="text-button"
          onClick={async () => {
            await api("/api/hunt-presets", {
              method: "POST",
              body: JSON.stringify({ ...payload(), name: form.q }),
            });
            reload();
          }}
        >
          Save as preset
        </button>
        {state.huntPresets.length > 0 && (
          <>
            <h3>Saved presets</h3>
            <div className="preset-list">
              {state.huntPresets.map((preset) => (
                <div key={preset.id}>
                  <button onClick={() => loadPreset(preset)}>
                    {preset.name}
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      await api(`/api/hunt-presets/${preset.id}`, {
                        method: "DELETE",
                      });
                      reload();
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="hunt-results v2-hunt-results">
        {preview ? (
          <div className="card">
            <div className="row">
              <div>
                <h3>{preview.matches.length} eligible matches</h3>
                <p className="muted">
                  {preview.inspected} inspected · {preview.alreadyTracked || 0}{" "}
                  already tracked
                  {preview.added !== undefined
                    ? ` · ${preview.added} newly saved`
                    : ""}
                </p>
              </div>
              <span className="pill">local preview</span>
            </div>
            {preview.matches.length ? (
              preview.matches.map((match) => (
                <div className="match-card" key={match.url}>
                  <div className="fit-ring">{match.fitScore}</div>
                  <div>
                    <b>{match.title}</b>
                    <span>
                      {match.company} · {match.location || "Location not set"}
                    </span>
                    <div className="reason-list">
                      {match.reasons.map((reason) => (
                        <small key={reason}>✓ {reason}</small>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Search />
                <h3>No roles met every rule</h3>
                <p>
                  Lower the fit threshold, remove a required keyword, or broaden
                  the role/location.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="card empty-state">
            <Bot />
            <h3>Preview before saving</h3>
            <p>
              Your filters are deterministic and visible. JobHuntr will never
              silently apply.
            </p>
          </div>
        )}
        <div className="card v2-hunt-history">
          <h3>Run history</h3>
          {state.agentRuns.length ? (
            state.agentRuns.map((run) => (
              <details className="run" key={run.id}>
                <summary>
                  <b>
                    <CheckCircle2 size={16} /> {run.search?.q} · {run.found}{" "}
                    matched
                  </b>
                  <small>
                    {new Date(
                      run.completedAt || run.createdAt,
                    ).toLocaleString()}{" "}
                    · {run.added ?? run.found} saved · {run.duplicates || 0}{" "}
                    duplicates
                  </small>
                </summary>
                {(run.steps || []).map((step) => (
                  <p className="step" key={step.name}>
                    ✓ <b>{step.name}</b>
                    <small>{step.detail}</small>
                  </p>
                ))}
              </details>
            ))
          ) : (
            <p className="empty">No runs yet.</p>
          )}
        </div>
      </div>
      {statusOpen && latestRun && (
        <div
          className="v2-session-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-status-title"
        >
          <button
            className="v2-session-backdrop"
            aria-label="Close infinite session details"
            onClick={() => setStatusOpen(false)}
          />
          <div className="v2-session-content">
            <div className="v2-session-head">
              <div>
                <span>INFINITE HUNTING SESSION</span>
                <h3 id="session-status-title">Latest infinite session</h3>
              </div>
              <span className={`pill ${latestRun.status}`}>
                {latestRun.status}
              </span>
            </div>
            <p className="v2-session-time">
              Started {new Date(latestRun.createdAt).toLocaleString()}
            </p>
            <div className="v2-session-stats">
              <div>
                <strong>{latestRun.inspected || 0}</strong>
                <span>Inspected</span>
              </div>
              <div>
                <strong>{latestRun.found || 0}</strong>
                <span>Matched</span>
              </div>
              <div>
                <strong>{latestRun.added || 0}</strong>
                <span>Saved</span>
              </div>
            </div>
            <div className="v2-session-steps">
              {(latestRun.steps || []).map((step) => (
                <div key={step.name}>
                  <CheckCircle2 size={16} />
                  <span>
                    <b>{step.name}</b>
                    <small>{step.detail}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="v2-session-actions">
              <button
                ref={statusCloseRef}
                className="secondary"
                onClick={() => setStatusOpen(false)}
              >
                Close
              </button>
              <button onClick={() => setTab("runs")}>Open all runs</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function RunsPage({ state, setTab }) {
  const runs = state.agentRuns || [];
  return (
    <section className="v2-runs-page">
      <div className="v2-page-intro">
        <div>
          <h2>All Runs</h2>
          <p>
            Review every job hunting workflow and the applications it evaluated.
          </p>
        </div>
        <button onClick={() => setTab("agent")}>
          <Plus size={16} /> New run
        </button>
      </div>
      <div className="v2-run-stats">
        <div>
          <span>Total runs</span>
          <strong>{runs.length}</strong>
        </div>
        <div>
          <span>Jobs evaluated</span>
          <strong>
            {runs.reduce(
              (sum, run) => sum + (run.inspected || run.found || 0),
              0,
            )}
          </strong>
        </div>
        <div>
          <span>Jobs saved</span>
          <strong>
            {runs.reduce((sum, run) => sum + (run.added || 0), 0)}
          </strong>
        </div>
      </div>
      <div className="card v2-runs-table">
        <div className="v2-table-head">
          <span>Run</span>
          <span>Status</span>
          <span>Evaluated</span>
          <span>Saved</span>
          <span>Started</span>
        </div>
        {runs.map((run) => (
          <div className="v2-run-row" key={run.id}>
            <span>
              <b>{run.search?.q || "Local hunt"}</b>
              <small>{run.search?.location || "All locations"}</small>
            </span>
            <span className="pill submitted">Completed</span>
            <strong>{run.inspected || run.found || 0}</strong>
            <strong>{run.added ?? run.found ?? 0}</strong>
            <time>
              {new Date(run.completedAt || run.createdAt).toLocaleString()}
            </time>
          </div>
        ))}
        {!runs.length && (
          <div className="v2-empty">
            <Bot />
            <h3>No runs yet</h3>
            <p>Start an Infinite Hunt to see its progress and results here.</p>
            <button onClick={() => setTab("agent")}>
              Create your first run
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
function SettingsPage({ state, reload }) {
  const p = state.profile;
  const [form, setForm] = useState({
    ...p,
    skills: (p.skills || []).join(", "),
    targetRoles: (p.targetRoles || []).join(", "),
    locations: (p.preferences?.locations || []).join(", "),
    remote: p.preferences?.remote,
    minSalary: p.preferences?.minSalary,
    weeklyApplicationGoal: p.preferences?.weeklyApplicationGoal || 5,
  });
  const save = async () => {
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        onboarded: true,
        name: form.name,
        headline: form.headline,
        location: form.location,
        skills: form.skills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        targetRoles: form.targetRoles
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        preferences: {
          remote: form.remote,
          minSalary: Number(form.minSalary) || 0,
          weeklyApplicationGoal: Math.max(
            1,
            Number(form.weeklyApplicationGoal) || 5,
          ),
          locations: form.locations
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      }),
    });
    reload();
  };
  return (
    <section className="v2-settings-page">
      <div className="v2-page-intro">
        <div>
          <h2>Profile & preferences</h2>
          <p>Keep your career profile and search defaults up to date.</p>
        </div>
        <button onClick={save}>
          <Save size={16} /> Save changes
        </button>
      </div>
      <div className="v2-settings-grid">
        <div className="card v2-settings-card">
          <div className="v2-settings-card-title">
            <span className="v2-settings-icon">
              <User size={18} />
            </span>
            <div>
              <h3>Your profile</h3>
              <p>Used to personalize matches, documents, and coaching.</p>
            </div>
          </div>
          {[
            ["name", "Name"],
            ["headline", "Headline"],
            ["location", "Home location"],
            ["targetRoles", "Target roles"],
            ["skills", "Skills"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={form[key] || ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="card v2-settings-card">
          <div className="v2-settings-card-title">
            <span className="v2-settings-icon">
              <Search size={18} />
            </span>
            <div>
              <h3>Search preferences</h3>
              <p>Control which opportunities JobHuntr prioritizes.</p>
            </div>
          </div>
          <label>
            Preferred locations
            <input
              value={form.locations || ""}
              onChange={(e) => setForm({ ...form, locations: e.target.value })}
            />
          </label>
          <label>
            Minimum salary
            <input
              type="number"
              value={form.minSalary || 0}
              onChange={(e) => setForm({ ...form, minSalary: e.target.value })}
            />
          </label>
          <label>
            Weekly application goal
            <input
              type="number"
              min="1"
              max="100"
              value={form.weeklyApplicationGoal}
              onChange={(e) =>
                setForm({ ...form, weeklyApplicationGoal: e.target.value })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.remote}
              onChange={(e) => setForm({ ...form, remote: e.target.checked })}
            />{" "}
            Include remote roles
          </label>
          <p className="hint">
            Used for local fit scores and hunt defaults. Nothing is sent over
            the network.
          </p>
        </div>
      </div>
    </section>
  );
}
function Privacy() {
  const [backupFile, setBackupFile] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [result, setResult] = useState(null);
  const restore = async () => {
    if (!backupFile) return;
    await api("/api/import", { method: "POST", body: await backupFile.text() });
    location.reload();
  };
  const importCsv = async () => {
    if (!csvFile) return;
    const jobs = parseCsv(await csvFile.text());
    if (!jobs.length) {
      setResult({
        error: "No rows with company and title columns were found.",
      });
      return;
    }
    const response = await api("/api/import/jobs", {
      method: "POST",
      body: JSON.stringify({ jobs }),
    });
    setResult(response);
  };
  return (
    <section className="v2-data-page">
      <div className="v2-page-intro">
        <div>
          <h2>Settings & data</h2>
          <p>Manage local backups, imports, exports, and privacy controls.</p>
        </div>
      </div>
      <div className="grid v2-data-grid">
        <div className="card">
          <h3>
            <ShieldCheck /> Local-first guarantees
          </h3>
          <p>
            All personal data persists to <code>./data/jobhuntr.json</code>.
            There is no hosted database, telemetry, auth vendor, or required API
            key.
          </p>
        </div>
        <div className="card">
          <h3>
            <Download /> Backup
          </h3>
          <p>Exports can contain private resume and note data.</p>
          <a className="button" href="/api/export">
            Download JSON
          </a>{" "}
          <a className="button secondary" href="/api/export/jobs.csv">
            Download CSV
          </a>
        </div>
        <div className="card">
          <h3>
            <Upload /> Restore workspace
          </h3>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Import JobHuntr JSON backup"
            onChange={(e) => setBackupFile(e.target.files?.[0])}
          />
          <button disabled={!backupFile} onClick={restore}>
            Restore JSON
          </button>
        </div>
        <div className="card">
          <h3>Import tracked jobs</h3>
          <p>
            Import a JobHuntr CSV or any CSV containing <code>company</code> and{" "}
            <code>title</code> headers. Matching URLs are skipped.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Import jobs CSV"
            onChange={(e) => {
              setCsvFile(e.target.files?.[0]);
              setResult(null);
            }}
          />
          <button disabled={!csvFile} onClick={importCsv}>
            Import CSV
          </button>
          {result && (
            <p className={result.error ? "error" : "success-message"}>
              {result.error ||
                `${result.added} jobs imported · ${result.skipped} duplicates skipped`}
            </p>
          )}
        </div>
        <div className="card">
          <h3>Secret scanning</h3>
          <p>
            <code>npm run secret:scan</code> blocks common private keys, tokens,
            and copied env files in CI.
          </p>
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
