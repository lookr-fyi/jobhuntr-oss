import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Medal,
  Trophy,
  Trash2,
  Calendar,
  Filter,
  MapPin,
  ExternalLink,
  Copy,
  ListPlus,
  MoreHorizontal,
  X,
} from "lucide-react";
import "./styles.css";
import { parseCsv } from "./csv.js";
import jobHuntrLogo from "./jobhuntr-logo.png";

const APP_ROUTES = [
  "overview",
  "agent",
  "queue",
  "board",
  "runs",
  "resume",
  "cover-letter",
  "tracker",
  "outreach",
  "audit",
  "gigs",
  "coach",
  "settings",
  "privacy",
];
const HUNT_WORKFLOWS = [
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
    "hiringcafe",
    "hc",
    "HiringCafe",
    "Search curated roles from company career pages.",
  ],
  [
    "jobright",
    "jr",
    "Jobright",
    "Find AI-matched roles across public listings.",
  ],
  [
    "simplify",
    "s",
    "Simplify",
    "Search application-ready roles from Simplify.",
  ],
  [
    "workatastartup",
    "w",
    "Work at a Startup",
    "Discover startup roles and founding-team opportunities.",
  ],
  [
    "ziprecruiter",
    "z",
    "ZipRecruiter",
    "Search broad job listings using your saved criteria.",
  ],
  [
    "dice",
    "d",
    "Dice",
    "Find technology roles using skill and location filters.",
  ],
  [
    "company",
    "↗",
    "Company Career Page Search",
    "Search verified company career pages directly.",
  ],
];
const OVERVIEW_MOTIVATION = [
  "One thoughtful application today is a brick in your next chapter.",
  "Interviews start with consistent, courageous outreach.",
  "Jobs are won by storytellers—keep refining yours.",
  "Your momentum is louder than any algorithm.",
  "Progress over perfection beats ghosting every time.",
  "You are one tailored message away from a warm intro.",
  "Hiring managers notice people who keep showing up.",
  "Stay curious—every rejection is market research.",
  "Stack small wins until they look like momentum.",
  "Opportunities move toward people in motion.",
  "Clarity follows action, not the other way around.",
  "Momentum beats motivation—press send.",
];
const TRACKER_STAGES = [
  "saved",
  "interested",
  "submitting",
  "applied",
  "interview",
  "offer",
  "rejected",
  "failed",
  "skipped",
  "removed",
];
const TRACKER_STAGE_LABELS = {
  saved: "Started",
  interested: "Queued",
  submitting: "Submitting",
  applied: "Applied",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  failed: "Failed",
  skipped: "Skipped",
  removed: "Removed",
};
const trackerStageLabel = (status) => TRACKER_STAGE_LABELS[status] || status;
const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const maximumListedSalary = (job) => {
  const values = String(job.salary || "")
    .match(/\d+(?:\.\d+)?\s*k?/gi)
    ?.map((value) => {
      const amount = Number.parseFloat(value);
      return /k/i.test(value) ? amount * 1000 : amount;
    });
  return values?.length ? Math.max(...values) : 0;
};
const boardJobType = (job) =>
  /contract|freelance|temporary/i.test(
    `${job.title || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`,
  )
    ? "contract"
    : /intern/i.test(`${job.title || ""} ${(job.tags || []).join(" ")}`)
      ? "internship"
      : "full-time";
const boardSeniority = (job) => {
  const text = `${job.title || ""} ${(job.tags || []).join(" ")}`;
  if (/principal|staff|lead|head|director|founding/i.test(text)) return "lead";
  if (/senior|sr\.?\b/i.test(text)) return "senior";
  if (/junior|jr\.?\b|entry|associate|intern/i.test(text)) return "entry";
  return "mid";
};
const boardSponsorship = (job) => {
  const text = `${job.description || ""} ${(job.tags || []).join(" ")}`;
  if (/no (visa |work )?sponsor|cannot sponsor|without sponsorship/i.test(text))
    return "no";
  if (/visa|sponsor|immigration|work authorization/i.test(text)) return "yes";
  return "unknown";
};
const formatRelativeTime = (value) => {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
};
const coverLetterPreviewDocument = (content, templateId = "minimal") => {
  const escaped = String(content || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const accent = ["modern", "tech-startup", "creative", "marketing"].includes(
    templateId,
  )
    ? "#2563eb"
    : "#0f172a";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:58px 54px;background:#fff;color:#27364a;font:15px/1.7 Georgia,serif;border-top:12px solid ${accent}}
    header{margin-bottom:34px;color:${accent};font:700 21px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
  </style></head><body><header>Cover Letter</header><pre>${escaped}</pre></body></html>`;
};

const api = async (path, options = {}) => {
  try {
    const res = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!res.ok) {
      const body = await res.text();
      let message = body;
      try {
        const parsed = JSON.parse(body);
        message = parsed.error || parsed.message || body;
      } catch {}
      throw new Error(message || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent("jobhuntr:api-error", {
        detail: error.message || "JobHuntr could not complete that action.",
      }),
    );
    throw error;
  }
};
const containDialogFocus = (event) => {
  if (event.key !== "Tab") return;
  const focusable = [
    ...event.currentTarget.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onClose,
  onConfirm,
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  }, [busy, onClose]);
  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <div
        className="modal-card v2-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        onKeyDown={containDialogFocus}
      >
        <span className="v2-danger-icon">
          <Trash2 size={21} />
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="danger" disabled={busy} onClick={confirm}>
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
function InfiniteHuntStatus({ runs, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const latest = runs[0] || null;
  const running = latest?.status === "running";
  return (
    <div
      className="v2-hunt-float"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setExpanded(false);
      }}
    >
      {expanded && (
        <div className="v2-hunt-popover" role="status">
          <div className="v2-hunt-popover-head">
            <span>
              <InfinityIcon size={15} /> Infinite Hunt
            </span>
            <em className={running ? "running" : ""}>
              {running ? "Active" : "Idle"}
            </em>
          </div>
          {latest ? (
            <>
              <strong>{latest.search?.q || "Latest local hunt"}</strong>
              <small>
                {latest.search?.location || "All locations"} ·{" "}
                {new Date(
                  latest.completedAt || latest.createdAt,
                ).toLocaleDateString()}
              </small>
              <dl>
                <div>
                  <dt>Inspected</dt>
                  <dd>{latest.inspected || 0}</dd>
                </div>
                <div>
                  <dt>Matched</dt>
                  <dd>{latest.found || 0}</dd>
                </div>
                <div>
                  <dt>Saved</dt>
                  <dd>{latest.added || 0}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p>
              No hunts yet. Start one to continuously discover local matches.
            </p>
          )}
          <span className="v2-hunt-hint">Open Infinite Hunting</span>
        </div>
      )}
      <button
        className={running ? "running" : ""}
        onClick={onOpen}
        aria-label={
          running ? "Infinite Hunt is active" : "Open Infinite Hunting status"
        }
      >
        <InfinityIcon size={22} />
        {running && <i />}
      </button>
    </div>
  );
}
function GettingStarted({ state, onNavigate }) {
  const [expanded, setExpanded] = useState(true);
  const items = [
    {
      label: "Start Infinite Hunt",
      detail: "Launch your first automated search",
      complete: state.agentRuns.length > 0,
      route: "agent",
    },
    {
      label: "Track your first role",
      detail: "Save an opportunity to your tracker",
      complete: state.jobs.length > 0,
      route: "tracker",
    },
    {
      label: "Create an ATS resume",
      detail: "Save a tailored resume version",
      complete: state.resumes.length > 0,
      route: "resume",
    },
    {
      label: "Create a cover letter",
      detail: "Build a reusable application letter",
      complete: state.coverLetters.length > 0,
      route: "cover-letter",
    },
    {
      label: "Review an application",
      detail: "Move a packet through submission",
      complete: state.submissions.some((item) => item.status === "submitted"),
      route: "queue",
    },
    {
      label: "Reach out to a hiring team",
      detail: "Prepare and record recruiter outreach",
      complete: state.outreachDrafts.some((item) =>
        ["sent", "replied", "archived"].includes(item.status),
      ),
      route: "outreach",
    },
  ];
  const complete = items.filter((item) => item.complete).length;
  if (complete === items.length) return null;
  return (
    <div className="v2-getting-started">
      <button
        className="v2-getting-started-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>
          <strong>Getting Started</strong>
          <small>
            {complete}/{items.length} completed (
            {Math.round((complete / items.length) * 100)}%)
          </small>
        </span>
        <ChevronRight size={14} />
      </button>
      <div className="v2-guidance-progress">
        <i style={{ width: `${(complete / items.length) * 100}%` }} />
      </div>
      {expanded && (
        <div className="v2-guidance-list">
          {items.map((item) => (
            <button
              className={item.complete ? "complete" : ""}
              key={item.label}
              onClick={() => onNavigate(item.route)}
            >
              {item.complete ? <CheckCircle2 size={15} /> : <i />}
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function App() {
  const [state, setState] = useState(null);
  const initialRoute = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const [tab, setTab] = useState(() =>
    APP_ROUTES.includes(initialRoute)
      ? initialRoute
      : APP_ROUTES.includes(localStorage.getItem("jobhuntr-active-route"))
        ? localStorage.getItem("jobhuntr-active-route")
        : "overview",
  );
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [err, setErr] = useState("");
  const load = () =>
    api("/api/state")
      .then(setState)
      .catch((e) => setErr(e.message));
  useEffect(load, []);
  useEffect(() => {
    const showApiError = (event) => setErr(event.detail);
    window.addEventListener("jobhuntr:api-error", showApiError);
    return () => window.removeEventListener("jobhuntr:api-error", showApiError);
  }, []);
  useEffect(() => {
    if (!err) return undefined;
    const timeout = window.setTimeout(() => setErr(""), 7000);
    return () => window.clearTimeout(timeout);
  }, [err]);
  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const close = (event) => {
      if (
        event.key === "Escape" ||
        !userMenuRef.current?.contains(event.target)
      )
        setUserMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", close);
    };
  }, [userMenuOpen]);
  useEffect(() => {
    localStorage.setItem("jobhuntr-active-route", tab);
    const nextHash = `#/${tab}`;
    const currentRoute = window.location.hash
      .replace(/^#\/?/, "")
      .split("?")[0];
    if (currentRoute !== tab) window.history.pushState({ tab }, "", nextHash);
  }, [tab]);
  useEffect(() => {
    const followHistory = () => {
      const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
      if (APP_ROUTES.includes(route)) setTab(route);
    };
    window.addEventListener("popstate", followHistory);
    window.addEventListener("hashchange", followHistory);
    return () => {
      window.removeEventListener("popstate", followHistory);
      window.removeEventListener("hashchange", followHistory);
    };
  }, []);
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
        onFocusCapture={() => setSidebarHovered(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setSidebarHovered(false);
        }}
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
                title={name === "runs" ? "Agent Runs" : label}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                <Icon size={14} />
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
        {sidebarHovered && <GettingStarted state={state} onNavigate={setTab} />}
        <div className="v2-user" ref={userMenuRef}>
          {userMenuOpen && (
            <div
              className="v2-user-menu"
              role="menu"
              aria-label="Local workspace menu"
            >
              <div className="v2-user-menu-identity">
                <span className="v2-avatar">
                  {state.profile.name?.slice(0, 1).toUpperCase() || (
                    <User size={15} />
                  )}
                </span>
                <span>
                  <strong>{state.profile.name || "Job Hunter"}</strong>
                  <small>Private local workspace</small>
                </span>
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setTab("settings");
                  setUserMenuOpen(false);
                }}
              >
                <User size={16} />
                <span>Profile & usage</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setTab("privacy");
                  setUserMenuOpen(false);
                }}
              >
                <ShieldCheck size={16} />
                <span>Settings & data</span>
              </button>
              <div className="v2-user-menu-status">
                <i /> Local data protected
              </div>
            </div>
          )}
          <button
            onClick={() => {
              if (window.matchMedia("(max-width: 760px)").matches)
                setTab("settings");
              else setUserMenuOpen((open) => !open);
            }}
            className={tab === "settings" ? "active" : ""}
            title="Profile and settings"
            aria-current={tab === "settings" ? "page" : undefined}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
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
        {err && (
          <div className="v2-error-toast" role="alert">
            <span>
              <X size={17} />
            </span>
            <div>
              <strong>Something went wrong</strong>
              <p>{err}</p>
            </div>
            <button aria-label="Dismiss error" onClick={() => setErr("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {tab === "overview" && (
          <Overview state={state} setTab={setTab} reload={load} />
        )}{" "}
        {tab === "tracker" && (
          <Tracker state={state} reload={load} setTab={setTab} />
        )}{" "}
        {tab === "board" && <Board state={state} reload={load} />}{" "}
        {tab === "queue" && (
          <Queue state={state} reload={load} setTab={setTab} />
        )}{" "}
        {tab === "resume" && <Resume state={state} reload={load} />}{" "}
        {tab === "coach" && <Coach state={state} reload={load} />}{" "}
        {tab === "audit" && <ProfileAudit state={state} reload={load} />}
        {tab === "gigs" && <Gigs state={state} reload={load} />}
        {tab === "agent" && (
          <Agent state={state} reload={load} setTab={setTab} />
        )}{" "}
        {tab === "runs" && (
          <RunsPage state={state} setTab={setTab} reload={load} />
        )}
        {tab === "cover-letter" && (
          <Resume state={state} reload={load} mode="cover-letter" />
        )}
        {tab === "outreach" && <OutreachPage state={state} reload={load} />}
        {tab === "settings" && (
          <SettingsPage state={state} reload={load} setTab={setTab} />
        )}{" "}
        {tab === "privacy" && <Privacy state={state} />}
      </main>
      {tab !== "agent" && (
        <InfiniteHuntStatus
          runs={state.agentRuns}
          onOpen={() => setTab("agent")}
        />
      )}
    </div>
  );
}
function Onboarding({ profile, reload }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: profile.targetRoles?.[0] || "Software Engineer",
    skills: (profile.skills || []).join(", "),
    location: profile.location || "United States",
    preferredLocations: (profile.preferences?.locations || ["Remote"]).join(
      ", ",
    ),
    minSalary: profile.preferences?.minSalary || 120000,
    weeklyGoal: profile.preferences?.weeklyApplicationGoal || 5,
    remote: true,
  });
  const finish = async () => {
    setSaving(true);
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          onboarded: true,
          name: form.name || "Local Job Hunter",
          location: form.location,
          headline: `${form.role} seeking high-impact teams`,
          targetRoles: [form.role].filter(Boolean),
          skills: form.skills
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          preferences: {
            ...profile.preferences,
            remote: form.remote,
            locations: form.preferredLocations
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            minSalary: Number(form.minSalary) || 0,
            weeklyApplicationGoal: Math.max(1, Number(form.weeklyGoal) || 5),
          },
        }),
      });
      await reload();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={containDialogFocus}
    >
      <div className="onboarding-shell">
        <aside className="v2-onboarding-aside">
          <div className="v2-onboarding-brand">
            <img src={jobHuntrLogo} alt="" />
            <strong>JobHuntr</strong>
          </div>
          <div>
            <span>PRIVATE DESKTOP WORKSPACE</span>
            <h2>Quality over quantity, from day one.</h2>
            <p>
              Discover aligned roles, prepare stronger applications, and keep
              every next step in one focused workspace.
            </p>
          </div>
          <ul>
            <li>
              <CheckCircle2 size={16} /> Local-first and private
            </li>
            <li>
              <CheckCircle2 size={16} /> Explainable job matching
            </li>
            <li>
              <CheckCircle2 size={16} /> Human-reviewed submissions
            </li>
          </ul>
        </aside>
        <div className="onboarding">
          <div
            className="v2-onboarding-progress"
            aria-label={`Setup step ${Math.max(1, step)} of 3`}
          >
            {[1, 2, 3].map((value) => (
              <i key={value} className={step >= value ? "active" : ""} />
            ))}
          </div>
          {step === 0 && (
            <>
              <img
                className="v2-onboarding-logo"
                src={jobHuntrLogo}
                alt="JobHuntr"
              />
              <span className="eyebrow">WELCOME TO JOBHUNTR</span>
              <h2 id="onboarding-title">Your job search stays yours.</h2>
              <p>
                No signup, telemetry, hosted database, or required AI key.
                Everything is saved to this computer and can be exported
                anytime.
              </p>
              <button onClick={() => setStep(1)}>
                Set up my workspace <ChevronRight size={17} />
              </button>
              <button className="text-button" onClick={finish}>
                Use demo profile
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <span className="eyebrow">STEP 1 OF 3</span>
              <h2 id="onboarding-title">What are you looking for?</h2>
              <p>
                Start with the role and identity JobHuntr should optimize for.
              </p>
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
              <label>
                Home location
                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="San Francisco, CA"
                />
              </label>
              <div className="v2-onboarding-actions">
                <button className="secondary" onClick={() => setStep(0)}>
                  Back
                </button>
                <button disabled={!form.role.trim()} onClick={() => setStep(2)}>
                  Continue <ChevronRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <span className="eyebrow">STEP 2 OF 3</span>
              <h2 id="onboarding-title">Show us your strengths</h2>
              <p>
                Add the skills JobHuntr should prioritize when scoring roles.
              </p>
              <label>
                Skills, comma-separated
                <textarea
                  value={form.skills}
                  onChange={(e) => setForm({ ...form, skills: e.target.value })}
                />
              </label>
              <div className="v2-skill-preview">
                {form.skills
                  .split(",")
                  .map((skill) => skill.trim())
                  .filter(Boolean)
                  .slice(0, 8)
                  .map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
              </div>
              <div className="v2-onboarding-actions">
                <button className="secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  disabled={!form.skills.trim()}
                  onClick={() => setStep(3)}
                >
                  Continue <ChevronRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <span className="eyebrow">STEP 3 OF 3</span>
              <h2 id="onboarding-title">Set your search preferences</h2>
              <p>These defaults can be changed anytime in User Center.</p>
              <label>
                Preferred locations
                <input
                  value={form.preferredLocations}
                  onChange={(e) =>
                    setForm({ ...form, preferredLocations: e.target.value })
                  }
                />
              </label>
              <div className="double">
                <label>
                  Minimum salary
                  <input
                    type="number"
                    min="0"
                    value={form.minSalary}
                    onChange={(e) =>
                      setForm({ ...form, minSalary: e.target.value })
                    }
                  />
                </label>
                <label>
                  Weekly application goal
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.weeklyGoal}
                    onChange={(e) =>
                      setForm({ ...form, weeklyGoal: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="check v2-onboarding-check">
                <input
                  type="checkbox"
                  checked={form.remote}
                  onChange={(e) =>
                    setForm({ ...form, remote: e.target.checked })
                  }
                />{" "}
                Include remote jobs
              </label>
              <div className="v2-onboarding-actions">
                <button className="secondary" onClick={() => setStep(2)}>
                  Back
                </button>
                <button disabled={saving} onClick={finish}>
                  {saving ? "Creating workspace…" : "Open my command center"}
                </button>
              </div>
            </>
          )}
          <small className="v2-onboarding-footnote">
            No account, subscription, or cloud connection required.
          </small>
        </div>
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
  const [motivationIndex, setMotivationIndex] = useState(
    () => new Date().getDate() % OVERVIEW_MOTIVATION.length,
  );
  const [typedMotivation, setTypedMotivation] = useState("");
  const [chartVisibility, setChartVisibility] = useState({
    evaluated: true,
    queued: true,
  });
  const [chartHover, setChartHover] = useState(null);
  const farewellCloseRef = useRef(null);
  useEffect(() => {
    const message = OVERVIEW_MOTIVATION[motivationIndex];
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let typingTimer;
    const startTimer = window.setTimeout(() => {
      if (reducedMotion) {
        setTypedMotivation(message);
        return;
      }
      setTypedMotivation("");
      let index = 0;
      typingTimer = window.setInterval(() => {
        index += 1;
        setTypedMotivation(message.slice(0, index));
        if (index >= message.length) window.clearInterval(typingTimer);
      }, 24);
    }, 0);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(typingTimer);
    };
  }, [motivationIndex]);
  useEffect(() => {
    if (!farewellOpen) return undefined;
    const returnFocus = document.activeElement;
    farewellCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFarewellOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [farewellOpen]);
  const s = state.summary;
  const firstName = (state.profile.name || "there").split(" ")[0];
  const submitted = s.byStatus.applied || 0;
  const now = new Date();
  const submittedToday = state.jobs.filter((job) => {
    if (job.status !== "applied") return false;
    const date = new Date(job.updatedAt || job.createdAt);
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }).length;
  const interviews = (s.byStatus.interview || 0) + (s.byStatus.offer || 0);
  const collected = s.totalJobs;
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
  const chartStart = new Date(
    state.meta?.createdAt ||
      state.jobs
        .map((job) => job.createdAt || job.updatedAt)
        .filter(Boolean)
        .sort()[0] ||
      now,
  );
  chartStart.setHours(0, 0, 0, 0);
  const chartDays = Math.max(
    1,
    Math.floor((now.getTime() - chartStart.getTime()) / 86400000) + 1,
  );
  const chartData = Array.from({ length: chartDays }, (_, index) => {
    const date = new Date(chartStart);
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() + index);
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
    setMotivationIndex((index) => (index + 1) % OVERVIEW_MOTIVATION.length);
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
      <div className="v2-momentum" aria-live="polite">
        <span>MOMENTUM REMINDER</span>
        <b>{typedMotivation || "\u00a0"}</b>
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
            <span>{submittedToday} sent today</span>
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
              <p>From your first signup to today.</p>
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
            {!visibleSeries.length ? (
              <div className="v2-chart-empty" role="status">
                <b>No lines selected.</b>
                <span>Turn on at least one series to see the trend.</span>
              </div>
            ) : (
              <>
                <div className="v2-chart-y-labels" aria-hidden="true">
                  {[chartMax, Math.round(chartMax / 2), 0].map(
                    (value, index) => (
                      <span key={`${value}-${index}`}>{value}</span>
                    ),
                  )}
                </div>
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Application progress over time"
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
                    <path
                      className={`line ${key}`}
                      d={chartPath(key)}
                      key={key}
                    />
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
                      left: `${Math.max(
                        8,
                        Math.min(
                          92,
                          (chartHover / Math.max(chartData.length - 1, 1)) *
                            100,
                        ),
                      )}%`,
                    }}
                  >
                    <b>
                      {chartData[chartHover].date.toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
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
              </>
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
          onKeyDown={containDialogFocus}
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
function Tracker({ state, reload, setTab }) {
  const stages = TRACKER_STAGES;
  const trackerParams = new URLSearchParams(
    window.location.hash.split("?")[1] || "",
  );
  const [form, setForm] = useState({
    company: "",
    title: "",
    location: "Remote",
    url: "",
    salary: "",
    description: "",
    tags: "",
    status: "saved",
  });
  const [selected, setSelected] = useState(
    trackerParams.get("job") || state.jobs[0]?.id,
  );
  const [query, setQuery] = useState("");
  const [visibleStages, setVisibleStages] = useState(() => {
    const linkedStages = trackerParams
      .get("statuses")
      ?.split(",")
      .filter((stage) => TRACKER_STAGES.includes(stage));
    if (linkedStages?.length) return new Set(linkedStages);
    try {
      const saved = JSON.parse(
        localStorage.getItem("jobTracker_visibleStatuses") || "null",
      );
      if (Array.isArray(saved) && saved.length) return new Set(saved);
    } catch {}
    return new Set(stages);
  });
  const [runFilter, setRunFilter] = useState(
    () =>
      trackerParams.get("run") ||
      localStorage.getItem("jobTracker_selectedAgentRun") ||
      "all",
  );
  const [showForm, setShowForm] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const funnelCloseRef = useRef(null);
  const job = state.jobs.find((item) => item.id === selected);
  const jobSubmission = state.submissions.find(
    (item) => item.jobId === selected,
  );
  const filtered = state.jobs.filter((item) => {
    const matchesStatus = visibleStages.has(item.status);
    const matchesRun =
      runFilter === "all" ||
      (runFilter === "manual" && !item.workflowRunId) ||
      (runFilter === "automated" && Boolean(item.workflowRunId)) ||
      item.workflowRunId === runFilter;
    const haystack =
      `${item.company} ${item.title} ${item.location} ${(item.tags || []).join(" ")}`.toLowerCase();
    return (
      matchesStatus && matchesRun && haystack.includes(query.toLowerCase())
    );
  });
  useEffect(() => {
    localStorage.setItem(
      "jobTracker_visibleStatuses",
      JSON.stringify([...visibleStages]),
    );
    localStorage.setItem("jobTracker_selectedAgentRun", runFilter);
    const params = new URLSearchParams();
    if (selected) params.set("job", selected);
    if (visibleStages.size !== TRACKER_STAGES.length)
      params.set("statuses", [...visibleStages].join(","));
    if (runFilter !== "all") params.set("run", runFilter);
    const hash = `#/tracker${params.size ? `?${params}` : ""}`;
    if (window.location.hash !== hash)
      window.history.replaceState({ tab: "tracker" }, "", hash);
  }, [visibleStages, runFilter, selected]);
  const toggleStage = (stage) => {
    setVisibleStages((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };
  const appliedStatuses = new Set([
    "applied",
    "interview",
    "offer",
    "rejected",
  ]);
  const funnelStages = [
    {
      id: "total",
      label: "All tracked",
      color: "#475569",
      jobs: filtered,
    },
    {
      id: "applied",
      label: "Applied",
      color: "#1d4ed8",
      jobs: filtered.filter((item) => appliedStatuses.has(item.status)),
    },
    {
      id: "interview",
      label: "Interviewing",
      color: "#b45309",
      jobs: filtered.filter((item) =>
        ["interview", "offer"].includes(item.status),
      ),
    },
    {
      id: "offer",
      label: "Offers",
      color: "#047857",
      jobs: filtered.filter((item) => item.status === "offer"),
    },
    {
      id: "rejected",
      label: "Rejected",
      color: "#b91c1c",
      jobs: filtered.filter((item) => item.status === "rejected"),
    },
  ];
  const interviewRoundStages = [
    ...new Set(
      filtered.flatMap((item) =>
        (item.interviewRounds || []).map((round) =>
          Number(round.roundType?.match(/\d+/)?.[0] || 0),
        ),
      ),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a - b)
    .map((roundNumber) => ({
      roundNumber,
      label: `Interview Round ${roundNumber}`,
      jobs: filtered.filter((item) => {
        const highest = Math.max(
          0,
          ...(item.interviewRounds || []).map((round) =>
            Number(round.roundType?.match(/\d+/)?.[0] || 0),
          ),
        );
        return highest >= roundNumber;
      }),
    }));
  useEffect(() => {
    if (!funnelOpen) return undefined;
    const returnFocus = document.activeElement;
    funnelCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFunnelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [funnelOpen]);
  const patch = async (id, body) => {
    await api(`/api/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await reload();
  };
  const selectJob = (id) => {
    setSelected(id);
    setEditForm(null);
  };
  const saveEdit = async () => {
    if (!job || !editForm?.company.trim() || !editForm?.title.trim()) return;
    setEditBusy(true);
    try {
      await patch(job.id, {
        ...editForm,
        tags: String(editForm.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setEditForm(null);
    } finally {
      setEditBusy(false);
    }
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
      status: "saved",
    });
    setSelected(created.id);
    setShowForm(false);
    await reload();
  };
  const remove = async () => {
    if (!job) return;
    await api(`/api/jobs/${job.id}`, { method: "DELETE" });
    setSelected(null);
    await reload();
  };
  return (
    <section className="tracker-page">
      <ConfirmDialog
        open={deleteOpen}
        title="Delete tracked job?"
        description={
          job
            ? `${job.title} at ${job.company} and its related notes, tasks, and drafts will be permanently removed.`
            : "This tracked job will be permanently removed."
        }
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
      <div className="v2-tracker-header">
        <h2>Job Tracker</h2>
        <div>
          <span>{filtered.length} applications</span>
          <button className="secondary" onClick={() => setFunnelOpen(true)}>
            Funnel Analysis
          </button>
          <a className="button secondary" href="/api/export/jobs.csv">
            <Download size={15} /> Export CSV
          </a>
        </div>
      </div>
      <div className="card tracker-filter-panel v2-tracker-filters-always">
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Search tracked jobs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs..."
          />
        </div>
        <div>
          <span className="tracker-filter-label">Show Columns:</span>
          <div className="tracker-status-filters">
            {stages.map((stage) => (
              <label key={stage}>
                <input
                  type="checkbox"
                  checked={visibleStages.has(stage)}
                  onChange={() => toggleStage(stage)}
                />
                <span className={`tracker-status-dot ${stage}`} />
                {trackerStageLabel(stage)}
              </label>
            ))}
          </div>
        </div>
        <label>
          <span className="tracker-filter-label">Run:</span>
          <select
            aria-label="Filter by agent run"
            value={runFilter}
            onChange={(event) => setRunFilter(event.target.value)}
          >
            <option value="all">All Runs</option>
            <option value="manual">Manual Applications Only</option>
            <option value="automated">Automated Applications Only</option>
            {(state.agentRuns || []).map((run) => (
              <option value={run.id} key={run.id}>
                {run.runName || run.search?.q || "Local hunt"} -{" "}
                {new Date(run.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            setVisibleStages(new Set(stages));
            setRunFilter("all");
          }}
        >
          Reset filters
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
        <div
          className="kanban"
          style={{
            gridTemplateColumns: `repeat(${Math.max(visibleStages.size, 1)}, minmax(230px, 1fr))`,
          }}
        >
          {stages
            .filter((stage) => visibleStages.has(stage))
            .map((stage) => (
              <div
                className="kanban-column"
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  patch(e.dataTransfer.getData("jobId"), { status: stage })
                }
              >
                <div className="column-title">
                  <b>{trackerStageLabel(stage)}</b>
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
                      onClick={() => selectJob(item.id)}
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
                <button
                  className="v2-tracker-add-job"
                  onClick={() => {
                    setForm((current) => ({ ...current, status: stage }));
                    setShowForm(true);
                  }}
                >
                  <Plus size={14} /> Add Job
                </button>
              </div>
            ))}
        </div>
        {job && (
          <div className="job-drawer">
            <div className="row">
              <span className={`pill ${editForm?.status || job.status}`}>
                {trackerStageLabel(editForm?.status || job.status)}
              </span>
              <div className="inline">
                {!job.workflowRunId && !editForm && (
                  <button
                    className="secondary small"
                    aria-label="Edit job"
                    onClick={() =>
                      setEditForm({
                        company: job.company || "",
                        title: job.title || "",
                        location: job.location || "",
                        salary: job.salary || "",
                        url: job.url || "",
                        description: job.description || "",
                        status: job.status,
                        tags: (job.tags || []).join(", "),
                      })
                    }
                  >
                    Edit
                  </button>
                )}
                <button
                  className="drawer-close"
                  aria-label="Close job details"
                  onClick={() => {
                    setSelected(null);
                    setEditForm(null);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            {editForm ? (
              <div className="job-edit-form">
                <h2>Edit Job</h2>
                <div className="form-grid">
                  {[
                    "title",
                    "company",
                    "location",
                    "salary",
                    "url",
                    "tags",
                  ].map((field) => (
                    <label key={field}>
                      {field === "url" ? "Job URL" : field}
                      <input
                        required={["title", "company"].includes(field)}
                        value={editForm[field]}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            [field]: event.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Status
                  <select
                    aria-label="Edit job status"
                    value={editForm.status}
                    onChange={(event) =>
                      setEditForm({ ...editForm, status: event.target.value })
                    }
                  >
                    {stages.map((stage) => (
                      <option value={stage} key={stage}>
                        {trackerStageLabel(stage)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="inline">
                  <button
                    disabled={
                      editBusy ||
                      !editForm.title.trim() ||
                      !editForm.company.trim()
                    }
                    onClick={saveEdit}
                  >
                    {editBusy ? "Saving…" : "Save job"}
                  </button>
                  <button
                    className="secondary"
                    disabled={editBusy}
                    onClick={() => setEditForm(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                    <option value={s} key={s}>
                      {trackerStageLabel(s)}
                    </option>
                  ))}
                </select>
                {safeHttpUrl(job.url) && (
                  <a
                    href={safeHttpUrl(job.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open job listing ↗
                  </a>
                )}
                <p>{job.description || "No description saved."}</p>
                <div className="chips">
                  {(job.tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <TrackerApplicationInsights
                  job={job}
                  submission={jobSubmission}
                  profile={state.profile}
                />
                {jobSubmission &&
                  !["submitted", "archived"].includes(jobSubmission.status) && (
                    <div className="v2-tracker-primary-actions">
                      <button
                        onClick={() => {
                          window.history.pushState(
                            { tab: "queue", packet: jobSubmission.id },
                            "",
                            `#/queue?packet=${encodeURIComponent(jobSubmission.id)}`,
                          );
                          setTab("queue");
                        }}
                      >
                        Go to Submission Queue
                      </button>
                    </div>
                  )}
                {["interview", "offer", "rejected"].includes(job.status) && (
                  <InterviewRounds job={job} reload={reload} />
                )}
                <Actions job={job} reload={reload} />
              </>
            )}
            {!editForm && (
              <>
                <h3>Status timeline</h3>
                <div className="status-history">
                  {(job.statusHistory || []).map((event, index) => (
                    <p key={`${event.at}-${index}`}>
                      <b>{trackerStageLabel(event.status)}</b>
                      <small>{new Date(event.at).toLocaleString()}</small>
                    </p>
                  ))}
                </div>
                <button className="danger" onClick={() => setDeleteOpen(true)}>
                  Delete role
                </button>
              </>
            )}
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
      {funnelOpen && (
        <div
          className="v2-funnel-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="funnel-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-funnel-backdrop"
            aria-label="Close funnel analysis"
            onClick={() => setFunnelOpen(false)}
          />
          <div className="v2-funnel-content">
            <div className="v2-funnel-head">
              <div>
                <span>PIPELINE PERFORMANCE</span>
                <h2 id="funnel-title">Job Application Funnel Analysis</h2>
                <p>See how tracked opportunities progress toward offers.</p>
              </div>
              <button
                ref={funnelCloseRef}
                className="drawer-close"
                aria-label="Close funnel analysis"
                onClick={() => setFunnelOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="v2-funnel-legend">
              {funnelStages.slice(1).map((stage) => (
                <span key={stage.id}>
                  <i style={{ background: stage.color }} /> {stage.label} ({" "}
                  {stage.jobs.length})
                </span>
              ))}
            </div>
            <div className="v2-funnel-chart">
              {funnelStages.slice(0, 4).map((stage, index) => {
                const width = Math.max(
                  18,
                  (stage.jobs.length / Math.max(filtered.length, 1)) * 100,
                );
                return (
                  <div className="v2-funnel-stage" key={stage.id}>
                    <div>
                      <b>{stage.label}</b>
                      <span>{stage.jobs.length}</span>
                    </div>
                    <button
                      style={{
                        width: `${width}%`,
                        background: stage.color,
                      }}
                      title={
                        stage.jobs.length
                          ? stage.jobs
                              .slice(0, 10)
                              .map((item) => `${item.company}: ${item.title}`)
                              .join("\n")
                          : `No jobs reached ${stage.label.toLowerCase()}`
                      }
                    >
                      {index > 0 && filtered.length
                        ? `${Math.round((stage.jobs.length / filtered.length) * 100)}%`
                        : "100%"}
                    </button>
                  </div>
                );
              })}
            </div>
            {interviewRoundStages.length > 0 && (
              <div className="v2-interview-funnel">
                <div className="row">
                  <div>
                    <span>INTERVIEW PROGRESSION</span>
                    <h3>Round-by-round conversion</h3>
                  </div>
                  <small>{interviewRoundStages.length} rounds tracked</small>
                </div>
                {interviewRoundStages.map((stage, index) => {
                  const priorCount =
                    index === 0
                      ? funnelStages[1].jobs.length
                      : interviewRoundStages[index - 1].jobs.length;
                  return (
                    <div
                      className="v2-interview-funnel-row"
                      key={stage.roundNumber}
                    >
                      <span>{stage.label}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(8, (stage.jobs.length / Math.max(filtered.length, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <strong>{stage.jobs.length}</strong>
                      <small>
                        {priorCount
                          ? `${Math.round((stage.jobs.length / priorCount) * 100)}% advanced`
                          : "No prior applications"}
                      </small>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="v2-funnel-summary">
              <div>
                <span>Application rate</span>
                <strong>
                  {filtered.length
                    ? Math.round(
                        (funnelStages[1].jobs.length / filtered.length) * 100,
                      )
                    : 0}
                  %
                </strong>
              </div>
              <div>
                <span>Interview rate</span>
                <strong>
                  {funnelStages[1].jobs.length
                    ? Math.round(
                        (funnelStages[2].jobs.length /
                          funnelStages[1].jobs.length) *
                          100,
                      )
                    : 0}
                  %
                </strong>
              </div>
              <div>
                <span>Offer rate</span>
                <strong>
                  {funnelStages[1].jobs.length
                    ? Math.round(
                        (funnelStages[3].jobs.length /
                          funnelStages[1].jobs.length) *
                          100,
                      )
                    : 0}
                  %
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function TrackerApplicationInsights({ job, submission, profile }) {
  const threshold = Number(
    submission?.atsThreshold ?? profile.preferences?.atsThreshold ?? 80,
  );
  const score = Number(submission?.atsScore ?? job.fitScore ?? 0);
  const profileSkills = new Set(
    (profile.skills || []).map((skill) => String(skill).toLowerCase()),
  );
  const keywords = [...new Set(job.tags || [])];
  const matched = keywords.filter((keyword) =>
    profileSkills.has(String(keyword).toLowerCase()),
  );
  const missing = submission?.missingKeywords?.length
    ? submission.missingKeywords
    : keywords.filter(
        (keyword) => !profileSkills.has(String(keyword).toLowerCase()),
      );
  const questions = submission?.applicationQuestions || [];
  return (
    <div className="v2-tracker-insights">
      <section className="v2-tracker-info-section" aria-label="ATS Analysis">
        <div className="v2-tracker-info-head">
          <h3>ATS Analysis</h3>
          <span
            className={`v2-ats-detail-score ${score >= threshold ? "high" : score >= 60 ? "medium" : "low"}`}
          >
            {score}%
          </span>
        </div>
        <div className="v2-ats-score-track" aria-hidden="true">
          <i style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
          <b style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }} />
        </div>
        <p>
          {score >= threshold
            ? "This resume meets your ATS application threshold."
            : `Below your ${threshold}% threshold—review the suggested keywords before applying.`}
        </p>
        {submission?.atsDecision && (
          <div className="v2-ats-document-choice">
            <CheckCircle2 size={15} />
            {submission.atsDecision === "optimized"
              ? "Optimized ATS resume selected"
              : "Original resume selected"}
          </div>
        )}
        {(matched.length > 0 || missing.length > 0) && (
          <div className="v2-ats-keyword-groups">
            {matched.length > 0 && (
              <div>
                <span>Matched keywords</span>
                <div className="chips">
                  {matched.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </div>
            )}
            {missing.length > 0 && (
              <div>
                <span>Keywords to add truthfully</span>
                <div className="chips missing">
                  {missing.slice(0, 8).map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      {questions.length > 0 && (
        <section
          className="v2-tracker-info-section"
          aria-label="Application Questions"
        >
          <div className="v2-tracker-info-head">
            <h3>Application Questions</h3>
            <span>{questions.length}</span>
          </div>
          <div className="v2-tracker-qa-list">
            {questions.map((item) => (
              <article key={item.id || item.question}>
                <strong>{item.question}</strong>
                <p>{item.answer || "No answer saved"}</p>
                <small className={item.confident ? "confident" : "uncertain"}>
                  {item.answer
                    ? item.confident
                      ? "✓ Confident"
                      : "Review answer"
                    : "Unanswered"}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
function InterviewRounds({ job, reload }) {
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [number, setNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const rounds = job.interviewRounds || [];
  const reset = () => {
    setEditingId(null);
    setShowForm(false);
    setNumber("");
    setNotes("");
  };
  const persist = async (next) => {
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ interviewRounds: next }),
      });
      await reload();
      reset();
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!number.trim() || !notes.trim()) return;
    const now = new Date().toISOString();
    const round = {
      id: editingId || `round-${Date.now()}`,
      roundType: `Interview Round ${number.trim()}`,
      notes: notes.trim(),
      status: "scheduled",
      outcome: "pending",
      createdAt: rounds.find((item) => item.id === editingId)?.createdAt || now,
      updatedAt: now,
    };
    await persist(
      editingId
        ? rounds.map((item) => (item.id === editingId ? round : item))
        : [...rounds, round],
    );
  };
  const edit = (round) => {
    setEditingId(round.id);
    setNumber(round.roundType?.match(/\d+/)?.[0] || "");
    setNotes(round.notes || "");
    setShowForm(true);
  };
  return (
    <section className="interview-rounds">
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete interview round?"
        description="This interview round and its notes will be permanently removed."
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          await persist(rounds.filter((round) => round.id !== deleteId));
          setDeleteId(null);
        }}
      />
      <div className="row">
        <h3>Interview Rounds</h3>
        {!showForm && (
          <button className="secondary small" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Add Round
          </button>
        )}
      </div>
      {showForm && (
        <div className="interview-round-form">
          <strong>
            {editingId ? "Edit Interview Round" : "Add New Interview Round"}
          </strong>
          <label>
            Round number
            <input
              type="number"
              min="1"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="e.g., 1, 2, 3"
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add details about this interview round…"
            />
          </label>
          <div className="inline">
            <button
              disabled={busy || !number.trim() || !notes.trim()}
              onClick={save}
            >
              {busy ? "Saving…" : editingId ? "Update" : "Add"}
            </button>
            <button className="secondary" disabled={busy} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="interview-round-list">
        {rounds.map((round) => (
          <article key={round.id}>
            <div className="row">
              <strong>{round.roundType}</strong>
              <span className="inline">
                <button className="text-button" onClick={() => edit(round)}>
                  Edit
                </button>
                <button
                  className="text-button danger"
                  onClick={() => setDeleteId(round.id)}
                >
                  Delete
                </button>
              </span>
            </div>
            <p>{round.notes}</p>
          </article>
        ))}
        {!rounds.length && !showForm && (
          <p className="interview-round-empty">
            No interview rounds yet. Add a round to track your progress.
          </p>
        )}
      </div>
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
function Board({ state, reload }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [selectedUrl, setSelectedUrl] = useState(
    () =>
      new URLSearchParams(window.location.hash.split("?")[1] || "").get(
        "job",
      ) || "",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [minimumFit, setMinimumFit] = useState(0);
  const [minimumSalary, setMinimumSalary] = useState(0);
  const [remoteType, setRemoteType] = useState("all");
  const [jobType, setJobType] = useState("all");
  const [seniority, setSeniority] = useState("all");
  const [sponsorship, setSponsorship] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("fit");
  const [newlyQueuedUrls, setNewlyQueuedUrls] = useState(new Set());
  const [queueing, setQueueing] = useState("");
  const [notice, setNotice] = useState("");
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const leaderboardCloseRef = useRef(null);
  const search = async () => {
    const jobs = await api("/api/board/search", {
      method: "POST",
      body: JSON.stringify({ q, location }),
    });
    setResults(jobs);
    setSelectedUrl("");
  };
  useEffect(() => {
    api("/api/board/search", {
      method: "POST",
      body: JSON.stringify({ q: "" }),
    }).then(setResults);
  }, []);
  const queuedUrls = new Set([
    ...state.jobs.map((job) => job.url).filter(Boolean),
    ...newlyQueuedUrls,
  ]);
  const visibleResults = useMemo(
    () =>
      results
        .filter(
          (job) =>
            job.fitScore >= minimumFit &&
            maximumListedSalary(job) >= minimumSalary &&
            (remoteType === "all" ||
              (remoteType === "remote"
                ? /remote|anywhere/i.test(job.location)
                : !/remote|anywhere/i.test(job.location))) &&
            (jobType === "all" || boardJobType(job) === jobType) &&
            (seniority === "all" || boardSeniority(job) === seniority) &&
            (sponsorship === "all" || boardSponsorship(job) === sponsorship) &&
            (source === "all" || job.source === source),
        )
        .sort((a, b) =>
          sort === "fit"
            ? b.fitScore - a.fitScore
            : sort === "salary"
              ? maximumListedSalary(b) - maximumListedSalary(a)
              : sort === "latest"
                ? new Date(b.collectedAt || b.postedAt || 0) -
                  new Date(a.collectedAt || a.postedAt || 0)
                : sort === "oldest"
                  ? new Date(a.collectedAt || a.postedAt || 0) -
                    new Date(b.collectedAt || b.postedAt || 0)
                  : sort === "company"
                    ? a.company.localeCompare(b.company)
                    : a.title.localeCompare(b.title),
        ),
    [
      results,
      minimumFit,
      minimumSalary,
      remoteType,
      jobType,
      seniority,
      sponsorship,
      source,
      sort,
    ],
  );
  const selected =
    visibleResults.find((job) => job.url === selectedUrl) || visibleResults[0];
  const selectedBoardUrl = selected?.url || "";
  useEffect(() => {
    if (!results.length) return;
    const params = new URLSearchParams();
    if (selectedBoardUrl) params.set("job", selectedBoardUrl);
    const hash = `#/board${params.size ? `?${params}` : ""}`;
    if (window.location.hash !== hash)
      window.history.replaceState({ tab: "board" }, "", hash);
  }, [selectedBoardUrl, results.length]);
  useEffect(() => {
    const followBoardLink = () => {
      const url = new URLSearchParams(
        window.location.hash.split("?")[1] || "",
      ).get("job");
      if (!url) return;
      if (url) setSelectedUrl(url);
    };
    window.addEventListener("hashchange", followBoardLink);
    return () => window.removeEventListener("hashchange", followBoardLink);
  }, []);
  const activeFilterCount = [
    location,
    minimumFit > 0,
    minimumSalary > 0,
    remoteType !== "all",
    jobType !== "all",
    seniority !== "all",
    sponsorship !== "all",
    source !== "all",
  ].filter(Boolean).length;
  const queueJob = async (job) => {
    setQueueing(job.url);
    setNotice("");
    try {
      const tracked = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ ...job, status: "saved" }),
      });
      await api("/api/submissions", {
        method: "POST",
        body: JSON.stringify({ jobId: tracked.id }),
      });
      setNewlyQueuedUrls((current) => new Set(current).add(job.url));
      setNotice(`${job.title} was added to your submission queue.`);
      reload();
    } finally {
      setQueueing("");
    }
  };
  useEffect(() => {
    if (!leaderboardOpen) return undefined;
    const returnFocus = document.activeElement;
    leaderboardCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setLeaderboardOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [leaderboardOpen]);
  const localContributions = [
    {
      name: state.profile.name || "Your local workspace",
      count: state.jobs.filter((job) => job.source === "Manual").length,
      current: true,
    },
    ...[...new Set(results.map((job) => job.source).filter(Boolean))].map(
      (boardSource) => ({
        name: boardSource,
        count: results.filter((job) => job.source === boardSource).length,
        current: false,
      }),
    ),
  ]
    .filter((entry) => entry.current || entry.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return (
    <section className="v2-board-page">
      <div className="v2-board-header">
        <span className="eyebrow">COMMUNITY JOB FEED</span>
        <div className="v2-page-intro">
          <div>
            <h2>Today's Picks</h2>
            <p>
              {results.length} jobs crowd-sourced by the local community. Add to
              queue before they're gone!
            </p>
          </div>
          <div className="v2-board-header-actions">
            <button
              className="secondary"
              onClick={() => setLeaderboardOpen(true)}
            >
              <Trophy size={15} /> Leaderboard
            </button>
            <button className="secondary" onClick={search}>
              <RefreshCcw size={15} /> Refresh now
            </button>
          </div>
        </div>
      </div>
      <form
        className="v2-board-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <div className="v2-board-search">
          <Search size={17} />
          <input
            aria-label="Search jobs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company, job title, or location"
          />
          {q && (
            <button
              className="icon-btn"
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={filtersOpen ? "secondary active" : "secondary"}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <Filter size={16} /> Filters
          {activeFilterCount > 0 && (
            <span className="v2-filter-count">{activeFilterCount}</span>
          )}
        </button>
        <button type="submit">Search</button>
      </form>
      {filtersOpen && (
        <div className="v2-board-filters">
          <label>
            Location
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Remote, city, or state"
            />
          </label>
          <label>
            Minimum match
            <select
              value={minimumFit}
              onChange={(event) => setMinimumFit(Number(event.target.value))}
            >
              <option value="0">Any match</option>
              <option value="25">25% or better</option>
              <option value="50">50% or better</option>
              <option value="75">75% or better</option>
            </select>
          </label>
          <label>
            Minimum salary
            <select
              aria-label="Minimum board salary"
              value={minimumSalary}
              onChange={(event) => setMinimumSalary(Number(event.target.value))}
            >
              <option value="0">Any salary</option>
              {[120000, 150000, 175000, 200000].map((salary) => (
                <option key={salary} value={salary}>
                  ${(salary / 1000).toFixed(0)}k+
                </option>
              ))}
            </select>
          </label>
          <label>
            Work arrangement
            <select
              aria-label="Board work arrangement"
              value={remoteType}
              onChange={(event) => setRemoteType(event.target.value)}
            >
              <option value="all">All arrangements</option>
              <option value="remote">Remote</option>
              <option value="onsite">On-site / hybrid</option>
            </select>
          </label>
          <label>
            Source
            <select
              aria-label="Board source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="all">All sources</option>
              {[
                ...new Set(results.map((job) => job.source).filter(Boolean)),
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Job type
            <select
              aria-label="Board job type"
              value={jobType}
              onChange={(event) => setJobType(event.target.value)}
            >
              <option value="all">All job types</option>
              <option value="full-time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </label>
          <label>
            Seniority
            <select
              aria-label="Board seniority"
              value={seniority}
              onChange={(event) => setSeniority(event.target.value)}
            >
              <option value="all">All levels</option>
              <option value="entry">Entry level</option>
              <option value="mid">Mid level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / Staff+</option>
            </select>
          </label>
          <label>
            Visa sponsorship
            <select
              aria-label="Board visa sponsorship"
              value={sponsorship}
              onChange={(event) => setSponsorship(event.target.value)}
            >
              <option value="all">Any sponsorship status</option>
              <option value="yes">Sponsorship mentioned</option>
              <option value="no">No sponsorship</option>
              <option value="unknown">Not specified</option>
            </select>
          </label>
          <label>
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="fit">Best match</option>
              <option value="latest">Collected (Latest to Earliest)</option>
              <option value="oldest">Collected (Earliest to Latest)</option>
              <option value="salary">Highest salary</option>
              <option value="company">Company</option>
              <option value="title">Job title</option>
            </select>
          </label>
          <button className="secondary" onClick={search}>
            Apply filters
          </button>
          <button
            className="text-button"
            type="button"
            disabled={!activeFilterCount}
            onClick={async () => {
              setLocation("");
              setMinimumFit(0);
              setMinimumSalary(0);
              setRemoteType("all");
              setJobType("all");
              setSeniority("all");
              setSponsorship("all");
              setSource("all");
              setSort("fit");
              setQ("");
              setResults(
                await api("/api/board/search", {
                  method: "POST",
                  body: JSON.stringify({ q: "", location: "" }),
                }),
              );
              setSelectedUrl("");
            }}
          >
            Clear all
          </button>
        </div>
      )}
      {notice && (
        <div className="v2-board-notice" role="status">
          {notice}
        </div>
      )}
      <div className="v2-board-results-summary">
        <strong>{visibleResults.length} opportunities</strong>
        <span>Updated just now · Local community feed</span>
      </div>
      <div className="v2-board-layout">
        <div className="v2-board-list">
          {visibleResults.map((j) => (
            <button
              type="button"
              className={`v2-board-row ${selected?.url === j.url ? "selected" : ""}`}
              key={j.url}
              onClick={() => setSelectedUrl(j.url)}
            >
              <span className="v2-job-logo">{j.company?.slice(0, 1)}</span>
              <span>
                <strong>{j.title}</strong>
                <small>
                  {j.company} · {j.location}
                </small>
                <span className="v2-board-row-tags">
                  <em>{j.fitScore}% match</em>
                  {queuedUrls.has(j.url) && <em className="saved">Saved</em>}
                  <small>
                    {boardJobType(j) === "full-time"
                      ? "Full-time"
                      : boardJobType(j) === "contract"
                        ? "Contract"
                        : "Internship"}
                  </small>
                  <small>
                    {boardSeniority(j) === "lead"
                      ? "Lead / Staff+"
                      : boardSeniority(j) === "senior"
                        ? "Senior"
                        : boardSeniority(j) === "entry"
                          ? "Entry level"
                          : "Mid level"}
                  </small>
                </span>
                <span className="v2-board-row-meta">
                  <small>
                    Posted {formatRelativeTime(j.postedAt || j.collectedAt)}
                  </small>
                  <small>{j.numApplicants || 0} applicants</small>
                  <small>Contributed by {j.source || "Local catalog"}</small>
                </span>
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
                <small>{selected.company}</small>
                <h3>{selected.title}</h3>
                <p>
                  <MapPin size={14} /> {selected.location}
                </p>
                <div className="v2-board-post-meta">
                  <span>
                    <Calendar size={13} /> Posted{" "}
                    {new Date(
                      selected.postedAt || selected.collectedAt,
                    ).toLocaleDateString()}
                  </span>
                  <span>
                    <Users size={13} /> {selected.numApplicants || 0} applicants
                  </span>
                </div>
              </div>
              <span className="v2-match-pill">{selected.fitScore}% match</span>
            </div>
            <div className="v2-job-facts">
              <span>{selected.salary || "Salary not listed"}</span>
              <span>
                {boardJobType(selected) === "full-time"
                  ? "Full-time"
                  : boardJobType(selected) === "contract"
                    ? "Contract"
                    : "Internship"}
              </span>
              <span>
                {boardSeniority(selected) === "lead"
                  ? "Lead / Staff+"
                  : boardSeniority(selected) === "senior"
                    ? "Senior"
                    : boardSeniority(selected) === "entry"
                      ? "Entry level"
                      : "Mid level"}
              </span>
              <span>
                {/remote|anywhere/i.test(selected.location)
                  ? "Remote"
                  : "On-site / hybrid"}
              </span>
              <span>
                {boardSponsorship(selected) === "yes"
                  ? "Visa sponsorship mentioned"
                  : boardSponsorship(selected) === "no"
                    ? "No visa sponsorship"
                    : "Visa status not specified"}
              </span>
            </div>
            <div className="v2-board-detail-actions">
              <button
                onClick={() => queueJob(selected)}
                disabled={
                  queueing === selected.url || queuedUrls.has(selected.url)
                }
              >
                <ListPlus size={16} />
                {queuedUrls.has(selected.url)
                  ? "Saved"
                  : queueing === selected.url
                    ? "Queueing…"
                    : "Queue"}
              </button>
              {safeHttpUrl(selected.url) && (
                <a
                  className="button secondary"
                  href={safeHttpUrl(selected.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View original post <ExternalLink size={15} />
                </a>
              )}
            </div>
            <h4>About the role</h4>
            <p>{selected.description}</p>
            <div className="v2-board-contributor">
              <span className="v2-leaderboard-avatar">
                {(selected.source || "L").slice(0, 1).toUpperCase()}
              </span>
              <span>
                <small>Contributed by</small>
                <b>{selected.source || "Local catalog"}</b>
              </span>
              <ShieldCheck size={16} />
            </div>
            <h4>Why it matches</h4>
            <ul>
              <li>Matches your target role and saved preferences</li>
              <li>Relevant skills found in your JobHuntr profile</li>
            </ul>
          </article>
        )}
        {!selected && (
          <div className="card v2-board-empty">
            <Search size={28} />
            <h3>No jobs found</h3>
            <p>Try a broader search or clear your filters.</p>
          </div>
        )}
      </div>
      {leaderboardOpen && (
        <div
          className="v2-session-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leaderboard-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-session-backdrop"
            aria-label="Close leaderboard"
            onClick={() => setLeaderboardOpen(false)}
          />
          <div className="v2-session-content v2-leaderboard-modal">
            <button
              ref={leaderboardCloseRef}
              className="v2-leaderboard-close"
              aria-label="Close"
              onClick={() => setLeaderboardOpen(false)}
            >
              <X size={19} />
            </button>
            <div className="v2-leaderboard-heading">
              <Trophy size={25} />
              <div>
                <h2 id="leaderboard-title">
                  Top Contributors of{" "}
                  {new Date().toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <p>Private, local contribution summary for this workspace</p>
              </div>
            </div>
            <div className="v2-leaderboard-privacy">
              <ShieldCheck size={16} /> No community identities or account data
              are included in the open-source edition.
            </div>
            <div className="v2-leaderboard-list">
              {localContributions.map((entry, index) => (
                <div
                  className={entry.current ? "current" : ""}
                  key={entry.name}
                >
                  <strong className={`rank rank-${index + 1}`}>
                    {index < 3 ? <Medal size={20} /> : index + 1}
                  </strong>
                  <span className="v2-leaderboard-avatar">
                    {entry.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <b>{entry.name}</b>
                    {entry.current && <small>You · local only</small>}
                  </span>
                  <strong>
                    {entry.count} job{entry.count === 1 ? "" : "s"}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function Queue({ state, reload, setTab }) {
  const queueParams = new URLSearchParams(
    window.location.hash.split("?")[1] || "",
  );
  const [jobId, setJobId] = useState(
    state.jobs.find((j) => !["applied", "rejected"].includes(j.status))?.id ||
      "",
  );
  const [selectedId, setSelectedId] = useState(
    queueParams.get("packet") ||
      state.submissions.find(
        (item) => !["archived", "submitted"].includes(item.status),
      )?.id ||
      "",
  );
  const [query, setQuery] = useState("");
  const [queueTab, setQueueTab] = useState(() =>
    ["apply", "search", "manual"].includes(queueParams.get("tab"))
      ? queueParams.get("tab")
      : "apply",
  );
  const [sourceSelectedId, setSourceSelectedId] = useState("");
  const [minimumFit, setMinimumFit] = useState(0);
  const [minimumAts, setMinimumAts] = useState(0);
  const [showAtsOnly, setShowAtsOnly] = useState(false);
  const [queueSort, setQueueSort] = useState("time");
  const [queueLocation, setQueueLocation] = useState("");
  const [queueSalary, setQueueSalary] = useState(0);
  const [queueRemote, setQueueRemote] = useState("all");
  const [queueJobType, setQueueJobType] = useState("all");
  const [queueSeniority, setQueueSeniority] = useState("all");
  const [queueSponsorship, setQueueSponsorship] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitBatch, setSubmitBatch] = useState([]);
  const [submitIndex, setSubmitIndex] = useState(0);
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);
  const [submittingReady, setSubmittingReady] = useState(false);
  const submitCloseRef = useRef(null);
  const active = state.submissions.filter(
    (item) => !["archived", "submitted"].includes(item.status),
  );
  const filtered = active
    .filter((item) => {
      const job = state.jobs.find((candidate) => candidate.id === item.jobId);
      return (
        (job?.fitScore || 0) >= minimumFit &&
        (item.atsScore ?? 0) >= minimumAts &&
        (!showAtsOnly || item.atsDecision === "optimized") &&
        (!queueLocation ||
          String(job?.location || "")
            .toLowerCase()
            .includes(queueLocation.toLowerCase())) &&
        maximumListedSalary(job || {}) >= queueSalary &&
        (queueRemote === "all" ||
          (queueRemote === "remote"
            ? /remote|anywhere/i.test(job?.location || "")
            : !/remote|anywhere/i.test(job?.location || ""))) &&
        (queueJobType === "all" || boardJobType(job || {}) === queueJobType) &&
        (queueSeniority === "all" ||
          boardSeniority(job || {}) === queueSeniority) &&
        (queueSponsorship === "all" ||
          boardSponsorship(job || {}) === queueSponsorship) &&
        `${job?.title || ""} ${job?.company || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) => {
      const aJob = state.jobs.find((job) => job.id === a.jobId);
      const bJob = state.jobs.find((job) => job.id === b.jobId);
      if (queueSort === "fit")
        return (bJob?.fitScore || 0) - (aJob?.fitScore || 0);
      if (queueSort === "ats") return (b.atsScore || 0) - (a.atsScore || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  const readySubmissions = active.filter((item) => item.status === "ready");
  const currentSubmitPacket = submitBatch[submitIndex] || null;
  const currentSubmitJob = state.jobs.find(
    (item) => item.id === currentSubmitPacket?.jobId,
  );
  const currentApplicationUrl = safeHttpUrl(currentSubmitJob?.url);
  const selected =
    filtered.find((item) => item.id === selectedId) || filtered[0];
  const selectedPacketId = selected?.id || "";
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
  const recommendedResume = (targetJobId) => {
    return (
      state.resumes.find((resume) => resume.jobId === targetJobId)?.id ||
      "profile-resume"
    );
  };
  const create = async () => {
    const created = await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        jobId,
        resumeId: recommendedResume(jobId),
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
        resumeId: recommendedResume(targetJobId),
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
  useEffect(() => {
    if (!submitOpen) return undefined;
    const returnFocus = document.activeElement;
    submitCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSubmitOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [submitOpen]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (queueTab !== "apply") params.set("tab", queueTab);
    if (queueTab === "apply" && selectedPacketId)
      params.set("packet", selectedPacketId);
    const hash = `#/queue${params.size ? `?${params}` : ""}`;
    if (window.location.hash !== hash)
      window.history.replaceState({ tab: "queue" }, "", hash);
  }, [queueTab, selectedPacketId]);
  useEffect(() => {
    const followQueueLink = () => {
      const params = new URLSearchParams(
        window.location.hash.split("?")[1] || "",
      );
      const linkedTab = params.get("tab");
      setQueueTab(
        ["apply", "search", "manual"].includes(linkedTab) ? linkedTab : "apply",
      );
      const packet = params.get("packet");
      if (packet) setSelectedId(packet);
    };
    window.addEventListener("hashchange", followQueueLink);
    return () => window.removeEventListener("hashchange", followQueueLink);
  }, []);
  const closeSubmitAssist = () => {
    setSubmitOpen(false);
    setSubmitBatch([]);
    setSubmitIndex(0);
    setSubmissionConfirmed(false);
  };
  const recordCurrentSubmission = async () => {
    if (!currentSubmitPacket || !submissionConfirmed) return;
    setSubmittingReady(true);
    try {
      await api(`/api/submissions/${currentSubmitPacket.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          applicationUrl: currentApplicationUrl,
          confirmedByUser: true,
        }),
      });
      await reload();
      if (submitIndex < submitBatch.length - 1) {
        setSubmitIndex((index) => index + 1);
        setSubmissionConfirmed(false);
      } else {
        closeSubmitAssist();
        setSelectedId("");
      }
    } finally {
      setSubmittingReady(false);
    }
  };
  return (
    <section className="v2-queue-page">
      <ConfirmDialog
        open={archiveOpen}
        title="Archive filtered queue jobs?"
        description={`${filtered.length} visible application packet${filtered.length === 1 ? "" : "s"} will leave the active queue. Tracked jobs and documents will remain available.`}
        confirmLabel="Archive packets"
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          await Promise.all(
            filtered.map((item) =>
              api(`/api/submissions/${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "archived" }),
              }),
            ),
          );
          setArchiveOpen(false);
          setSelectedId("");
          await reload();
        }}
      />
      <div className="v2-queue-title-row">
        <div>
          <h2>Submission Queue</h2>
          <p>
            Review collected jobs, attachments, and application details before
            submitting.
          </p>
        </div>
        <div className="inline">
          <button
            disabled={!readySubmissions.length}
            onClick={() => {
              setSubmitBatch(readySubmissions);
              setSubmitIndex(0);
              setSubmissionConfirmed(false);
              setSubmitOpen(true);
            }}
            title={
              readySubmissions.length
                ? "Record reviewed applications as submitted"
                : "Complete every review item to enable submitting"
            }
          >
            <InfinityIcon size={16} /> Start Submitting
          </button>
          <button className="secondary" onClick={reload}>
            <RefreshCcw size={15} /> Refresh
          </button>
        </div>
      </div>
      <div className="v2-queue-info">
        <ShieldCheck size={18} />
        <div>
          <strong>Review before you submit</strong>
          <p>
            Confirmed queued jobs are processed in your next Infinite Hunt. New
            application answers can be saved in your About Me profile.
          </p>
          <button
            className="text-button"
            onClick={() => {
              sessionStorage.setItem("jobhuntr-user-tab", "about");
              setTab("settings");
            }}
          >
            About Me
          </button>
        </div>
      </div>
      <div className="v2-queue-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={queueTab === "apply"}
          className={queueTab === "apply" ? "active" : ""}
          onClick={() => setQueueTab("apply")}
        >
          <ClipboardListIcon /> From Apply Runs <em>{active.length}</em>
        </button>
        <button
          role="tab"
          aria-selected={queueTab === "search"}
          className={queueTab === "search" ? "active" : ""}
          onClick={() => setQueueTab("search")}
        >
          <Search size={15} /> From Search Runs{" "}
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
          <Briefcase size={15} /> From Job Board{" "}
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
              <button
                className="secondary"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((current) => !current)}
              >
                <Filter size={15} /> Filters
              </button>
              <button
                className="secondary danger"
                disabled={!filtered.length}
                onClick={() => setArchiveOpen(true)}
              >
                <Trash2 size={15} /> Archive filtered
              </button>
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
          {filtersOpen && (
            <div className="v2-queue-filter-panel">
              <label>
                Minimum profile match
                <select
                  aria-label="Minimum queue match score"
                  value={minimumFit}
                  onChange={(event) =>
                    setMinimumFit(Number(event.target.value))
                  }
                >
                  <option value="0">All</option>
                  {[40, 50, 60, 70, 80, 90].map((score) => (
                    <option key={score} value={score}>
                      Above {score}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minimum ATS score
                <select
                  aria-label="Minimum queue ATS score"
                  value={minimumAts}
                  onChange={(event) =>
                    setMinimumAts(Number(event.target.value))
                  }
                >
                  <option value="0">All</option>
                  {[40, 50, 60, 70, 80, 90].map((score) => (
                    <option key={score} value={score}>
                      Above {score}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Has ATS resume
                <select
                  aria-label="Show jobs with ATS resume"
                  value={String(showAtsOnly)}
                  onChange={(event) =>
                    setShowAtsOnly(event.target.value === "true")
                  }
                >
                  <option value="false">All jobs</option>
                  <option value="true">ATS resume only</option>
                </select>
              </label>
              <label>
                Sort by
                <select
                  aria-label="Sort submission queue"
                  value={queueSort}
                  onChange={(event) => setQueueSort(event.target.value)}
                >
                  <option value="time">Queue time</option>
                  <option value="fit">Match score</option>
                  <option value="ats">ATS score</option>
                </select>
              </label>
              <label>
                Location
                <input
                  aria-label="Queue location"
                  value={queueLocation}
                  onChange={(event) => setQueueLocation(event.target.value)}
                  placeholder="Remote, city, or state"
                />
              </label>
              <label>
                Minimum salary
                <select
                  aria-label="Minimum queue salary"
                  value={queueSalary}
                  onChange={(event) =>
                    setQueueSalary(Number(event.target.value))
                  }
                >
                  <option value="0">Any salary</option>
                  {[120000, 150000, 175000, 200000].map((salary) => (
                    <option value={salary} key={salary}>
                      ${(salary / 1000).toFixed(0)}k+
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Work arrangement
                <select
                  aria-label="Queue work arrangement"
                  value={queueRemote}
                  onChange={(event) => setQueueRemote(event.target.value)}
                >
                  <option value="all">All arrangements</option>
                  <option value="remote">Remote</option>
                  <option value="onsite">On-site / hybrid</option>
                </select>
              </label>
              <label>
                Job type
                <select
                  aria-label="Queue job type"
                  value={queueJobType}
                  onChange={(event) => setQueueJobType(event.target.value)}
                >
                  <option value="all">All job types</option>
                  <option value="full-time">Full-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </select>
              </label>
              <label>
                Seniority
                <select
                  aria-label="Queue seniority"
                  value={queueSeniority}
                  onChange={(event) => setQueueSeniority(event.target.value)}
                >
                  <option value="all">All levels</option>
                  <option value="entry">Entry level</option>
                  <option value="mid">Mid level</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Lead / Staff+</option>
                </select>
              </label>
              <label>
                Visa sponsorship
                <select
                  aria-label="Queue visa sponsorship"
                  value={queueSponsorship}
                  onChange={(event) => setQueueSponsorship(event.target.value)}
                >
                  <option value="all">Any sponsorship status</option>
                  <option value="yes">Sponsorship mentioned</option>
                  <option value="no">No sponsorship</option>
                  <option value="unknown">Not specified</option>
                </select>
              </label>
              <button
                className="secondary v2-queue-reset-filters"
                onClick={() => {
                  setMinimumFit(0);
                  setMinimumAts(0);
                  setShowAtsOnly(false);
                  setQueueSort("time");
                  setQueueLocation("");
                  setQueueSalary(0);
                  setQueueRemote("all");
                  setQueueJobType("all");
                  setQueueSeniority("all");
                  setQueueSponsorship("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
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
                      <div className="v2-queue-tags">
                        {job?.salary && <em>{job.salary}</em>}
                        {(job?.tags || []).slice(0, 2).map((tag) => (
                          <em key={tag}>{tag}</em>
                        ))}
                      </div>
                      <span>
                        <i className={`queue-state ${item.status}`} />
                        {item.status === "ready" ? "Submitting" : "Queued"}
                        <em>{job?.fitScore || 0}% match</em>
                        {item.atsScore !== undefined && (
                          <em className="ats">{item.atsScore}% ATS</em>
                        )}
                      </span>
                    </span>
                    <time>Queued {formatRelativeTime(item.createdAt)}</time>
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
      {submitOpen && (
        <div
          className="v2-template-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-ready-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-template-backdrop"
            aria-label="Close start submitting dialog"
            onClick={closeSubmitAssist}
          />
          <div className="v2-template-modal-content v2-submit-ready-modal">
            <span className="v2-connect-icon">
              <CheckCircle2 size={22} />
            </span>
            <h3 id="submit-ready-title">Start submitting</h3>
            <p className="v2-submit-progress">
              Application {Math.min(submitIndex + 1, submitBatch.length)} of{" "}
              {submitBatch.length}
            </p>
            <div className="v2-submit-current-job">
              <span className="v2-job-logo">
                {(currentSubmitJob?.company || "J").slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{currentSubmitJob?.title || "Missing role"}</strong>
                <small>{currentSubmitJob?.company || "Unknown company"}</small>
              </span>
            </div>
            <ol className="v2-submit-assist-steps">
              <li>
                Open the company application and review every populated field.
              </li>
              <li>
                Resolve validation errors, uploads, authentication, or CAPTCHA
                manually.
              </li>
              <li>Submit on the company site, then return here to confirm.</li>
            </ol>
            {currentApplicationUrl ? (
              <a
                className="v2-submit-open-link"
                href={currentApplicationUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} /> Open application form
              </a>
            ) : (
              <p className="v2-submit-missing-url" role="alert">
                This job has no valid HTTP application URL. Open the employer’s
                site manually before confirming.
              </p>
            )}
            <label className="check v2-submit-confirmation">
              <input
                type="checkbox"
                checked={submissionConfirmed}
                onChange={(event) =>
                  setSubmissionConfirmed(event.target.checked)
                }
              />
              I personally verified that the external application was submitted
              successfully.
            </label>
            <small className="v2-submit-safety-note">
              Fail closed: JobHuntr does not fill, click, or infer success on an
              external form. The tracker changes only after this confirmation.
            </small>
            <div className="v2-template-modal-actions">
              <button
                ref={submitCloseRef}
                className="secondary"
                onClick={closeSubmitAssist}
              >
                Cancel
              </button>
              <button
                disabled={submittingReady || !submissionConfirmed}
                onClick={recordCurrentSubmission}
              >
                {submittingReady
                  ? "Recording…"
                  : submitIndex < submitBatch.length - 1
                    ? "Record submitted & next"
                    : "Record submitted"}
              </button>
            </div>
          </div>
        </div>
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
  const attachedResume = state.resumes.find((item) => item.id === s.resumeId);
  const attachedLetter = state.coverLetters.find(
    (item) => item.id === s.coverLetterId,
  );
  const resumeLabel = attachedResume?.name
    ? attachedResume.name
    : s.resumeId === "profile-resume"
      ? "Original profile resume"
      : "No resume attached";
  const updatePacket = async (body) => {
    await api(`/api/submissions/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await reload();
  };
  const updateChecklist = async (id, done) => {
    const checklist = s.checklist.map((x) =>
      x.id === id ? { ...x, done } : x,
    );
    await updatePacket({
      checklist,
      status: checklist.every((x) => x.done) ? "ready" : "draft",
    });
  };
  const updateQuestion = async (id, answer) => {
    const applicationQuestions = (s.applicationQuestions || []).map(
      (question) =>
        question.id === id
          ? { ...question, answer, confident: true }
          : question,
    );
    await updatePacket({ applicationQuestions });
  };
  return (
    <div className="packet">
      <div className="row v2-packet-heading">
        <div>
          <b>{job?.title || "Missing role"}</b>
          <small>
            {job?.company} · {job?.location || "Location unavailable"}
          </small>
        </div>
        <span className={`pill ${s.status}`}>
          {s.status === "ready" ? "Submitting" : "Queued"}
        </span>
      </div>
      <div className="v2-packet-job-facts">
        <span>
          <small>Source</small>
          <b>{job?.source || "Tracked job"}</b>
        </span>
        <span>
          <small>Profile match</small>
          <b>{job?.fitScore || 0}%</b>
        </span>
        <span>
          <small>Salary</small>
          <b>{job?.salary || "Not listed"}</b>
        </span>
      </div>
      <details className="v2-packet-section" open>
        <summary>Job description</summary>
        <p>{job?.description || "No job description was captured."}</p>
        {!!job?.tags?.length && (
          <div className="chips">
            {job.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </details>
      {!!job?.matchReasons?.length && (
        <details className="v2-packet-section">
          <summary>Why JobHuntr queued this role</summary>
          <ul>
            {job.matchReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
      <section className="v2-packet-section v2-packet-documents">
        <h4>Application documents</h4>
        <div>
          <span>
            <FileText size={18} />
            <span>
              <b>{resumeLabel}</b>
              <small>
                {s.atsDecision === "optimized"
                  ? "Tailored ATS resume"
                  : "Base resume"}
              </small>
            </span>
          </span>
          {attachedResume && (
            <a
              href={`/print/resume/${attachedResume.id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Preview ${attachedResume.name}`}
            >
              Preview
            </a>
          )}
        </div>
        {attachedLetter && (
          <div>
            <span>
              <FileText size={18} />
              <span>
                <b>{attachedLetter.title}</b>
                <small>Cover letter</small>
              </span>
            </span>
            <a
              href={`/print/cover-letter/${attachedLetter.id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Preview ${attachedLetter.title}`}
            >
              Preview
            </a>
          </div>
        )}
      </section>
      {!!s.applicationQuestions?.length && (
        <section className="v2-packet-section v2-application-questions">
          <div className="v2-packet-section-heading">
            <div>
              <h4>Application Questions</h4>
              <p>
                Answers are remembered in About Me for your next application.
              </p>
            </div>
            <span>
              {
                s.applicationQuestions.filter((question) =>
                  question.answer?.trim(),
                ).length
              }
              /{s.applicationQuestions.length} answered
            </span>
          </div>
          {s.applicationQuestions.map((question) => {
            const prompt = (
              <span>
                {question.question}
                {question.answer?.trim() && <em>Remembered</em>}
              </span>
            );
            if (question.questionType === "multiple_choice") {
              return (
                <fieldset key={question.id}>
                  <legend>{prompt}</legend>
                  <div className="v2-question-options">
                    {(question.options || []).map((option) => (
                      <label key={option}>
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option}
                          checked={question.answer === option}
                          onChange={() => updateQuestion(question.id, option)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }
            if (question.questionType === "dropdown") {
              return (
                <label key={question.id}>
                  {prompt}
                  <select
                    value={question.answer || ""}
                    onChange={(event) =>
                      updateQuestion(question.id, event.target.value)
                    }
                  >
                    <option value="">Select an answer…</option>
                    {(question.options || []).map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={question.id}>
                {prompt}
                <textarea
                  rows={2}
                  defaultValue={question.answer || ""}
                  placeholder="Enter your answer…"
                  onBlur={(event) => {
                    if (event.target.value !== (question.answer || ""))
                      updateQuestion(question.id, event.target.value);
                  }}
                />
              </label>
            );
          })}
        </section>
      )}
      <section className="v2-packet-section v2-packet-checklist">
        <h4>Review checklist</h4>
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
      </section>
      <div className="attachments v2-packet-attachments">
        <div
          className={`v2-ats-recommendation ${
            s.atsDecision === "optimized" ? "recommended" : "manual"
          }`}
        >
          {s.atsDecision === "optimized" ? (
            <CheckCircle2 size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}
          <span>
            <strong>
              {s.atsDecision === "optimized"
                ? "ATS resume generated"
                : s.atsDecision === "original"
                  ? "Original resume meets your ATS threshold"
                  : "Resume ready for review"}
            </strong>
            <small>
              {s.atsScore !== undefined
                ? `${s.atsScore}% original resume alignment · ${s.atsThreshold}% threshold`
                : `${job?.fitScore || 0}% profile match · Review before submitting`}
            </small>
          </span>
        </div>
        <label>
          Resume attachment
          <select
            value={s.resumeId || ""}
            onChange={(event) => updatePacket({ resumeId: event.target.value })}
          >
            <option value="">No resume attached</option>
            <option value="profile-resume">Original profile resume</option>
            {state.resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cover letter attachment
          <select
            value={s.coverLetterId || ""}
            onChange={(event) =>
              updatePacket({ coverLetterId: event.target.value })
            }
          >
            <option value="">No cover letter attached</option>
            {state.coverLetters.map((letter) => (
              <option key={letter.id} value={letter.id}>
                {letter.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="v2-packet-footer-actions">
        <button
          className="success"
          disabled={!s.checklist.every((x) => x.done)}
          onClick={async () => {
            await api(`/api/submissions/${s.id}/submit`, {
              method: "POST",
              body: JSON.stringify({ confirmedByUser: true }),
            });
            reload();
          }}
        >
          <CheckCircle2 size={16} /> I submitted this externally
        </button>
        <button
          className="secondary"
          onClick={() => updatePacket({ status: "archived" })}
        >
          Remove
        </button>
      </div>
      {safeHttpUrl(job?.url) && (
        <a
          className="v2-apply-manually"
          href={safeHttpUrl(job.url)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} /> Apply manually (required if blocked by
          captcha)
        </a>
      )}
    </div>
  );
}
const COVER_LETTER_TEMPLATES = [
  {
    id: "blank",
    name: "Blank Template",
    category: "General",
    description: "Start with a clean slate and create your own design",
    content:
      "Dear {{company}},\n\n{{opening}} My background in {{skills}} maps well to the {{role}} opportunity.\n\n{{evidence}}\n\n{{closing}}\n\nBest,\n{{name}}",
  },
  {
    id: "minimal",
    name: "Minimal",
    category: "General",
    description: "Clean and simple design perfect for any industry",
    content:
      "Dear {{company}},\n\nI’m applying for the {{role}} position. {{opening}}\n\n{{evidence}}\n\nMy relevant strengths include {{skills}}. {{closing}}\n\n{{name}}",
  },
  {
    id: "professional",
    name: "Professional",
    category: "General",
    description: "Traditional format ideal for corporate positions",
    content:
      "Dear Hiring Manager at {{company}},\n\n{{opening}} My experience in {{skills}} aligns strongly with your {{role}} opening.\n\n{{evidence}}\n\n{{closing}}\n\nSincerely,\n{{name}}",
  },
  {
    id: "modern",
    name: "Modern",
    category: "General",
    description: "Contemporary design with subtle color accents",
    content:
      "{{name}}\nCandidate for {{role}}\n\nHello {{company}} team,\n\n{{opening}}\n\nWHY I’M A STRONG FIT\n{{evidence}}\n\nCORE STRENGTHS\n{{skills}}\n\n{{closing}}",
  },
  {
    id: "creative",
    name: "Creative",
    category: "Creative",
    description: "Eye-catching design perfect for creative roles",
    content:
      "Hello {{company}},\n\n{{opening}}\n\nHere is the story behind my fit for {{role}}: {{evidence}}\n\nI bring {{skills}}. {{closing}}\n\nCreatively yours,\n{{name}}",
  },
  ...[
    [
      "tech-startup",
      "Tech Startup",
      "Technology",
      "Modern design perfect for tech companies and startups",
    ],
    [
      "finance",
      "Finance",
      "Finance",
      "Conservative and professional for financial services",
    ],
    [
      "healthcare",
      "Healthcare",
      "Healthcare",
      "Caring and professional design for healthcare roles",
    ],
    [
      "marketing",
      "Marketing",
      "Marketing",
      "Vibrant and creative design for marketing professionals",
    ],
    [
      "education",
      "Education",
      "Education",
      "Academic and professional for education sector",
    ],
    [
      "legal",
      "Legal",
      "Legal",
      "Traditional and formal for legal professionals",
    ],
    [
      "engineering",
      "Engineering",
      "Engineering",
      "Technical and professional for engineering roles",
    ],
    [
      "sales",
      "Sales",
      "Sales",
      "Dynamic and results-focused for sales positions",
    ],
    [
      "nonprofit",
      "Nonprofit",
      "Nonprofit",
      "Mission-focused design for nonprofit organizations",
    ],
    [
      "consulting",
      "Consulting",
      "Consulting",
      "Strategic and analytical for consulting firms",
    ],
    [
      "startup",
      "Startup",
      "Startup",
      "Energetic and innovative for startup environments",
    ],
  ].map(([id, name, category, description]) => ({
    id,
    name,
    category,
    description,
    content: `Dear {{company}},\n\n{{opening}} I’m excited to apply for the {{role}} position.\n\n{{evidence}}\n\nMy experience with {{skills}} would help me contribute quickly. {{closing}}\n\nSincerely,\n{{name}}`,
  })),
];
function Resume({ state, reload, mode = "resume" }) {
  const resumeRef = useRef(null);
  const [resume, setResume] = useState(state.profile.resumeText);
  const [name, setName] = useState("Targeted resume");
  const [templateId, setTemplateId] = useState(
    state.templates?.[0]?.id || "clean-ats",
  );
  const [jobId, setJobId] = useState(state.jobs[0]?.id || "");
  const [score, setScore] = useState(null);
  const [letter, setLetter] = useState(
    mode === "cover-letter" ? null : state.coverLetters[0] || null,
  );
  const [letterWizard, setLetterWizard] = useState(() => {
    if (mode !== "cover-letter") return null;
    try {
      const saved = sessionStorage.getItem("jobhuntr-cover-letter-wizard");
      return saved ? JSON.parse(saved) : null;
    } catch {
      sessionStorage.removeItem("jobhuntr-cover-letter-wizard");
      return null;
    }
  });
  const [preview, setPreview] = useState(state.resumes[0] || null);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateSort, setTemplateSort] = useState("name");
  const [templateSortOrder, setTemplateSortOrder] = useState("asc");
  const [templateDialog, setTemplateDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyTemplate, setHistoryTemplate] = useState("all");
  const [showAllResumes, setShowAllResumes] = useState(false);
  const templateDialogCloseRef = useRef(null);
  useEffect(() => {
    if (mode !== "cover-letter") return;
    if (letterWizard) {
      sessionStorage.setItem(
        "jobhuntr-cover-letter-wizard",
        JSON.stringify(letterWizard),
      );
      const nextHash = `#/cover-letter?step=${letterWizard.step}`;
      if (window.location.hash !== nextHash)
        window.history.replaceState(
          { tab: "cover-letter", step: letterWizard.step },
          "",
          nextHash,
        );
    } else {
      sessionStorage.removeItem("jobhuntr-cover-letter-wizard");
      if (window.location.hash.startsWith("#/cover-letter?"))
        window.history.replaceState(
          { tab: "cover-letter" },
          "",
          "#/cover-letter",
        );
    }
  }, [letterWizard, mode]);
  const visibleTemplates = state.templates
    .filter((template) =>
      `${template.name} ${template.description}`
        .toLowerCase()
        .includes(templateQuery.toLowerCase()),
    )
    .sort((a, b) => {
      const comparison =
        templateSort === "modified"
          ? new Date(a.updatedAt || a.createdAt || 0) -
            new Date(b.updatedAt || b.createdAt || 0)
          : a.name.localeCompare(b.name);
      return templateSortOrder === "asc" ? comparison : -comparison;
    });
  const sortTemplates = (field) => {
    if (templateSort === field) {
      setTemplateSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setTemplateSort(field);
      setTemplateSortOrder("desc");
    }
  };
  const filteredResumes = state.resumes.filter((item) => {
    const template = state.templates.find(
      (candidate) => candidate.id === item.templateId,
    );
    const job = state.jobs.find((candidate) => candidate.id === item.jobId);
    const matchesQuery =
      `${item.name} ${template?.name || ""} ${job?.title || ""} ${job?.company || ""} ${job?.location || ""}`
        .toLowerCase()
        .includes(historyQuery.toLowerCase());
    const matchesTemplate =
      historyTemplate === "all" || item.templateId === historyTemplate;
    const created = new Date(item.createdAt || item.updatedAt);
    const matchesMonth =
      showAllResumes ||
      (created.getMonth() === new Date().getMonth() &&
        created.getFullYear() === new Date().getFullYear());
    return matchesQuery && matchesTemplate && matchesMonth;
  });
  const resumeGroups = state.templates
    .map((template) => ({
      template,
      resumes: filteredResumes.filter(
        (item) => item.templateId === template.id,
      ),
    }))
    .filter((group) => group.resumes.length > 0);
  useEffect(() => {
    if (!templateDialog) return undefined;
    const returnFocus = document.activeElement;
    templateDialogCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setTemplateDialog(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [templateDialog]);
  const openTemplateDialog = (template = null) =>
    setTemplateDialog({
      id: template?.id || null,
      step: 1,
      name:
        template?.name ||
        `New ATS Template - ${new Date().toLocaleDateString()}`,
      description: template?.description || "",
      originalResume: template?.originalResume || "",
      editedResume:
        template?.editedResume ||
        template?.originalResume ||
        state.profile.resumeText ||
        "",
      additionalExperience: template?.additionalExperience || "",
      testJobId: template?.testJobId || state.jobs[0]?.id || "",
      uploadedFileName: template?.originalResume ? "Saved resume" : "",
      scoreResult: null,
      sections: (
        template?.sections || ["Summary", "Skills", "Experience", "Education"]
      ).join(", "),
      newSection: "",
    });
  const saveTemplate = async () => {
    const payload = {
      name: templateDialog.name,
      description: templateDialog.description,
      originalResume: templateDialog.originalResume,
      editedResume: templateDialog.editedResume,
      additionalExperience: templateDialog.additionalExperience,
      testJobId: templateDialog.testJobId,
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
  const advanceTemplateWizard = async () => {
    if (templateDialog.step !== 4) {
      setTemplateDialog({
        ...templateDialog,
        step: templateDialog.step + 1,
      });
      return;
    }
    const scoreResult = await api("/api/resume/score", {
      method: "POST",
      body: JSON.stringify({
        resumeText: [
          templateDialog.editedResume,
          templateDialog.additionalExperience,
        ]
          .filter(Boolean)
          .join("\n\n"),
        jobId: templateDialog.testJobId,
      }),
    });
    setTemplateDialog({ ...templateDialog, scoreResult, step: 5 });
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
      body: JSON.stringify({ name, templateId, jobId, content }),
    });
    setPreview(saved);
    await reload();
  };
  const openLetterWizard = () =>
    setLetterWizard({
      step: 1,
      templateId: COVER_LETTER_TEMPLATES[0].id,
      templateName: COVER_LETTER_TEMPLATES[0].name,
      templateContent: COVER_LETTER_TEMPLATES[0].content,
      resumeId: state.resumes[0]?.id || "",
      jobId: jobId || state.jobs[0]?.id || "",
      jobDescription:
        state.jobs.find((item) => item.id === (jobId || state.jobs[0]?.id))
          ?.description || "",
    });
  const generateLetter = async (wizard = null, keepWizard = false) => {
    const options = wizard || { jobId };
    const created = await api("/api/cover-letters", {
      method: "POST",
      body: JSON.stringify(options),
    });
    setLetter(created);
    setLetterWizard(
      keepWizard ? { ...wizard, step: 5, result: created } : null,
    );
    await reload();
  };
  const finishLetterWizard = async () => {
    if (!letterWizard?.result) return;
    await api(`/api/cover-letters/${letterWizard.result.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: letterWizard.result.title,
        body: letterWizard.result.body,
      }),
    });
    setLetter(null);
    setLetterWizard(null);
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
    if (letterWizard) {
      const wizardSteps = [
        "Choose Template",
        "Edit Template",
        "Select Resume",
        "Job Information",
        "Final Result",
      ];
      const selectedJob = state.jobs.find(
        (item) => item.id === letterWizard.jobId,
      );
      const selectedResume = state.resumes.find(
        (item) => item.id === letterWizard.resumeId,
      );
      return (
        <section className="v2-cover-wizard">
          <div className="v2-cover-wizard-head">
            <button
              className="secondary"
              aria-label="Back to cover letters"
              onClick={() => setLetterWizard(null)}
            >
              ←
            </button>
            <div>
              <h2>Cover Letter Template</h2>
              <p>Build a reusable, job-specific letter in five guided steps.</p>
            </div>
          </div>
          <ol className="v2-wizard-progress" aria-label="Cover letter steps">
            {wizardSteps.map((label, index) => (
              <li
                className={
                  letterWizard.step === index + 1
                    ? "active"
                    : letterWizard.step > index + 1
                      ? "complete"
                      : ""
                }
                key={label}
              >
                <span>{letterWizard.step > index + 1 ? "✓" : index + 1}</span>
                <b>{label}</b>
              </li>
            ))}
          </ol>
          <div className="card v2-cover-step">
            {letterWizard.step === 1 && (
              <>
                <div className="v2-cover-step-head">
                  <h3>Choose a Template</h3>
                  <p>Select a professional template for your cover letter</p>
                </div>
                {(() => {
                  const selectedIndex = Math.max(
                    0,
                    COVER_LETTER_TEMPLATES.findIndex(
                      (template) => template.id === letterWizard.templateId,
                    ),
                  );
                  const selectedTemplate =
                    COVER_LETTER_TEMPLATES[selectedIndex];
                  const selectTemplate = (index) => {
                    const template =
                      COVER_LETTER_TEMPLATES[
                        (index + COVER_LETTER_TEMPLATES.length) %
                          COVER_LETTER_TEMPLATES.length
                      ];
                    setLetterWizard({
                      ...letterWizard,
                      templateId: template.id,
                      templateName: template.name,
                      templateContent: template.content,
                    });
                  };
                  return (
                    <div className="v2-cover-carousel">
                      <div className="v2-cover-carousel-stage">
                        <button
                          className="secondary v2-cover-carousel-arrow"
                          aria-label="Previous cover letter template"
                          onClick={() => selectTemplate(selectedIndex - 1)}
                        >
                          <ChevronLeft size={30} />
                        </button>
                        <div
                          className={`v2-cover-template-sheet ${selectedTemplate.id}`}
                          role="img"
                          aria-label={`${selectedTemplate.name} cover letter template preview`}
                        >
                          <span className="v2-cover-template-letterhead">
                            {state.profile.name || "Your Name"}
                          </span>
                          <i /> <i /> <i />
                          <b>{selectedTemplate.name}</b>
                          <span>{selectedTemplate.category}</span>
                        </div>
                        <button
                          className="secondary v2-cover-carousel-arrow"
                          aria-label="Next cover letter template"
                          onClick={() => selectTemplate(selectedIndex + 1)}
                        >
                          <ChevronRight size={30} />
                        </button>
                      </div>
                      <div
                        className="v2-cover-template-strip"
                        aria-label="Cover letter templates"
                      >
                        {COVER_LETTER_TEMPLATES.map((template, index) => (
                          <button
                            className={
                              index === selectedIndex ? "selected" : ""
                            }
                            aria-label={`Select ${template.name}`}
                            key={template.id}
                            onClick={() => selectTemplate(index)}
                          >
                            <span className={template.id}>
                              <i />
                              <i />
                              <i />
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="v2-cover-template-info">
                        <h3>{selectedTemplate.name}</h3>
                        <p>{selectedTemplate.description}</p>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
            {letterWizard.step === 2 && (
              <>
                <div className="v2-cover-step-head">
                  <span>STEP 2 OF 5</span>
                  <h3>Edit Your Cover Letter Template</h3>
                  <p>
                    Focus on styling your cover letter template. JobHuntr will
                    personalize the text with your resume and target job.
                  </p>
                </div>
                <div className="v2-cover-editor-workspace">
                  <label>
                    <span>HTML Source</span>
                    <textarea
                      className="v2-cover-template-editor"
                      aria-label="Template content"
                      value={letterWizard.templateContent}
                      onChange={(event) =>
                        setLetterWizard({
                          ...letterWizard,
                          templateContent: event.target.value,
                        })
                      }
                      placeholder="Enter your cover letter template…"
                    />
                  </label>
                  <div className="v2-cover-live-preview">
                    <span>Preview</span>
                    <iframe
                      sandbox=""
                      srcDoc={coverLetterPreviewDocument(
                        letterWizard.templateContent,
                        letterWizard.templateId,
                      )}
                      title="Cover Letter Preview"
                    />
                  </div>
                </div>
                <div className="v2-cover-placeholder-help">
                  {[
                    "{{company}}",
                    "{{role}}",
                    "{{opening}}",
                    "{{skills}}",
                    "{{evidence}}",
                    "{{closing}}",
                    "{{name}}",
                  ].map((placeholder) => (
                    <code key={placeholder}>{placeholder}</code>
                  ))}
                </div>
                <div className="v2-cover-prompt-bar">
                  <input
                    aria-label="Prompt to optimize cover letter"
                    value={letterWizard.promptInstructions || ""}
                    onChange={(event) =>
                      setLetterWizard({
                        ...letterWizard,
                        promptInstructions: event.target.value,
                      })
                    }
                    placeholder="Prompt to optimize cover letter (e.g., Make it more professional)"
                  />
                  <button
                    disabled={!letterWizard.promptInstructions?.trim()}
                    onClick={() => {
                      const prompt =
                        letterWizard.promptInstructions.toLowerCase();
                      let templateContent = letterWizard.templateContent;
                      if (/professional|formal/.test(prompt))
                        templateContent = templateContent
                          .replace(/^Hello /, "Dear ")
                          .replace("Creatively yours", "Sincerely");
                      if (/direct|concise/.test(prompt))
                        templateContent = templateContent.replace(
                          /I am excited to apply|I’m excited to apply/gi,
                          "I’m applying",
                        );
                      setLetterWizard({
                        ...letterWizard,
                        templateContent,
                        promptApplied: true,
                      });
                    }}
                  >
                    <Sparkles size={15} /> Apply Prompt
                  </button>
                </div>
                {letterWizard.promptApplied && (
                  <p className="v2-inline-success" role="status">
                    <CheckCircle2 size={14} /> Prompt applied locally
                  </p>
                )}
              </>
            )}
            {letterWizard.step === 3 && (
              <>
                <div className="v2-cover-step-head">
                  <span>STEP 3 OF 5</span>
                  <h3>Select Resume or ATS Template</h3>
                  <p>
                    Pick the source JobHuntr should use to ground your cover
                    letter in truthful experience.
                  </p>
                </div>
                <h4 className="v2-cover-option-title">
                  Option 1: Select Resume
                </h4>
                <div className="v2-cover-resume-list">
                  <button
                    className={
                      !letterWizard.resumeId && !letterWizard.atsTemplateId
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      setLetterWizard({
                        ...letterWizard,
                        resumeId: "",
                        atsTemplateId: "",
                      })
                    }
                  >
                    <FileText size={20} />
                    <span>
                      <b>Profile resume</b>
                      <small>Use your current profile resume text</small>
                    </span>
                  </button>
                  {state.resumes.map((item) => (
                    <button
                      className={
                        letterWizard.resumeId === item.id ? "selected" : ""
                      }
                      key={item.id}
                      onClick={() =>
                        setLetterWizard({
                          ...letterWizard,
                          resumeId: item.id,
                          atsTemplateId: "",
                        })
                      }
                    >
                      <FileText size={20} />
                      <span>
                        <b>{item.name}</b>
                        <small>
                          {state.templates.find(
                            (template) => template.id === item.templateId,
                          )?.name || "ATS resume"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <h4 className="v2-cover-option-title">
                  Option 2: Select ATS Template
                </h4>
                <div className="v2-cover-resume-list v2-cover-ats-list">
                  {state.templates.map((template) => (
                    <button
                      className={
                        letterWizard.atsTemplateId === template.id
                          ? "selected"
                          : ""
                      }
                      key={template.id}
                      onClick={() =>
                        setLetterWizard({
                          ...letterWizard,
                          resumeId: "",
                          atsTemplateId: template.id,
                        })
                      }
                    >
                      <Sparkles size={20} />
                      <span>
                        <b>{template.name}</b>
                        <small>
                          {template.description ||
                            "Use this ATS template with your profile resume"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <label className="v2-cover-instructions">
                  Cover Letter Instructions
                  <textarea
                    value={letterWizard.coverLetterInstructions || ""}
                    onChange={(event) =>
                      setLetterWizard({
                        ...letterWizard,
                        coverLetterInstructions: event.target.value,
                      })
                    }
                    placeholder="Highlight the most relevant accomplishments, tone, or experience for this letter…"
                  />
                  <small>
                    Enter key instructions for your cover letter. They remain
                    private in this local wizard session.
                  </small>
                </label>
              </>
            )}
            {letterWizard.step === 4 && (
              <>
                <div className="v2-cover-step-head">
                  <span>STEP 4 OF 5</span>
                  <h3>Job Information</h3>
                  <p>
                    Provide job details to personalize your cover letter and
                    match the position requirements.
                  </p>
                </div>
                {state.jobs.length > 0 && (
                  <label>
                    Use a tracked job
                    <select
                      value={letterWizard.jobId}
                      onChange={(event) => {
                        const job = state.jobs.find(
                          (item) => item.id === event.target.value,
                        );
                        setLetterWizard({
                          ...letterWizard,
                          jobId: event.target.value,
                          jobDescription: job?.description || "",
                        });
                      }}
                    >
                      <option value="">Enter job information manually</option>
                      {state.jobs.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.company} — {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedJob && (
                  <div className="v2-cover-job-summary">
                    <b>{selectedJob.title}</b>
                    <span>
                      {selectedJob.company} · {selectedJob.location}
                    </span>
                    <p>{selectedJob.description}</p>
                  </div>
                )}
                <label className="v2-cover-job-description">
                  <span>
                    <b>Job Description</b>
                    <small>
                      {(letterWizard.jobDescription || "").length}/5000
                      characters
                    </small>
                  </span>
                  <textarea
                    aria-label="Job Description"
                    maxLength={5000}
                    value={letterWizard.jobDescription || ""}
                    onChange={(event) =>
                      setLetterWizard({
                        ...letterWizard,
                        jobDescription: event.target.value,
                      })
                    }
                    placeholder={
                      "Paste the complete job description here, including:\n• Job title and company\n• Required qualifications and skills\n• Responsibilities and duties\n• Preferred experience and education"
                    }
                  />
                  <small>
                    Paste the complete description so JobHuntr can tailor the
                    letter to the exact role. Changes are saved in this local
                    wizard session.
                  </small>
                </label>
              </>
            )}
            {letterWizard.step === 5 && (
              <>
                <div className="v2-cover-step-head">
                  <span>STEP 5 OF 5</span>
                  <h3>Your Cover Letter</h3>
                  <p>
                    Review the generated result, make final edits, and save it
                    to your cover-letter history.
                  </p>
                </div>
                <div className="v2-cover-review">
                  <div>
                    <span>Template</span>
                    <b>{letterWizard.templateName}</b>
                  </div>
                  <div>
                    <span>Resume</span>
                    <b>
                      {selectedResume?.name ||
                        state.templates.find(
                          (template) =>
                            template.id === letterWizard.atsTemplateId,
                        )?.name ||
                        "Profile resume"}
                    </b>
                  </div>
                  <div>
                    <span>Target</span>
                    <b>
                      {selectedJob
                        ? `${selectedJob.title} @ ${selectedJob.company}`
                        : "Select a job"}
                    </b>
                  </div>
                </div>
                <div className="v2-cover-final-editor">
                  <label>
                    Cover letter title
                    <input
                      value={letterWizard.result?.title || ""}
                      onChange={(event) =>
                        setLetterWizard({
                          ...letterWizard,
                          result: {
                            ...letterWizard.result,
                            title: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Generated cover letter
                    <textarea
                      value={letterWizard.result?.body || ""}
                      onChange={(event) =>
                        setLetterWizard({
                          ...letterWizard,
                          result: {
                            ...letterWizard.result,
                            body: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="v2-cover-result-preview">
                  <div>
                    <span>Document Preview</span>
                    {letterWizard.result?.id && (
                      <a
                        href={`/print/cover-letter/${letterWizard.result.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={15} /> Preview PDF
                      </a>
                    )}
                  </div>
                  <iframe
                    sandbox=""
                    srcDoc={coverLetterPreviewDocument(
                      letterWizard.result?.body || "",
                      letterWizard.templateId,
                    )}
                    title="Generated Cover Letter Preview"
                  />
                </div>
              </>
            )}
            <div className="v2-cover-step-actions">
              <button
                className="secondary"
                disabled={letterWizard.step === 1 || letterWizard.step === 5}
                onClick={() =>
                  setLetterWizard({
                    ...letterWizard,
                    step: letterWizard.step - 1,
                  })
                }
              >
                Previous
              </button>
              {letterWizard.step < 4 ? (
                <button
                  onClick={() =>
                    setLetterWizard({
                      ...letterWizard,
                      step: letterWizard.step + 1,
                    })
                  }
                >
                  Continue
                </button>
              ) : letterWizard.step === 4 ? (
                <button
                  disabled={
                    !letterWizard.jobId && !letterWizard.jobDescription?.trim()
                  }
                  onClick={() => generateLetter(letterWizard, true)}
                >
                  <Sparkles size={16} /> Generate Cover Letter
                </button>
              ) : (
                <button onClick={finishLetterWizard}>
                  <Save size={16} /> Save and Finish
                </button>
              )}
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="v2-document-page">
        <ConfirmDialog
          open={deleteTarget?.type === "letter"}
          title="Delete cover letter?"
          description={
            deleteTarget
              ? `“${deleteTarget.item.title}” will be permanently removed from your local workspace.`
              : "This cover letter will be permanently removed."
          }
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await api(`/api/cover-letters/${deleteTarget.item.id}`, {
              method: "DELETE",
            });
            if (letter?.id === deleteTarget.item.id) setLetter(null);
            await reload();
          }}
        />
        <div className="v2-document-page-head">
          <div>
            {letter ? (
              <>
                <button
                  className="secondary v2-cover-back-to-list"
                  onClick={() => setLetter(null)}
                >
                  <ChevronLeft size={16} /> Back to Cover Letters
                </button>
                <h2>Edit Cover Letter</h2>
                <p>Review and update your saved local document.</p>
              </>
            ) : (
              <>
                <h2>Cover Letters</h2>
                <p>
                  {state.coverLetters.length} cover letter
                  {state.coverLetters.length === 1 ? "" : "s"} available
                </p>
              </>
            )}
          </div>
          {!letter && (
            <div className="v2-document-actions">
              <button onClick={openLetterWizard}>
                <Plus size={16} /> Create Cover Letter
              </button>
            </div>
          )}
        </div>
        <div className={`v2-cover-layout ${letter ? "editing" : ""}`}>
          {!letter && (
            <div className="v2-template-grid">
              {state.coverLetters.map((item) => (
                <article
                  key={item.id}
                  className={letter?.id === item.id ? "selected" : ""}
                >
                  <button
                    className="v2-letter-card-preview"
                    aria-label={`Edit ${item.title}`}
                    onClick={() => setLetter(item)}
                  >
                    <span className="v2-letter-status">Ready</span>
                    <span className="v2-letter-paper">
                      <b>{state.profile.name}</b>
                      <i />
                      <i />
                      <em>{item.title}</em>
                      <span>{item.body.slice(0, 460)}</span>
                    </span>
                  </button>
                  <footer>
                    <button onClick={() => setLetter(item)}>
                      <b>{item.title}</b>
                      <small>
                        <Calendar size={13} />{" "}
                        {new Date(
                          item.updatedAt || item.createdAt,
                        ).toLocaleDateString()}
                      </small>
                    </button>
                    <button
                      className="v2-letter-delete"
                      aria-label={`Delete ${item.title}`}
                      onClick={() => setDeleteTarget({ type: "letter", item })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </footer>
                </article>
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
          )}
          {letter && (
            <div className="card v2-letter-workspace">
              <>
                <div className="row">
                  <h3>{letter.title}</h3>
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
                    onClick={() =>
                      setDeleteTarget({ type: "letter", item: letter })
                    }
                  >
                    Delete
                  </button>
                </div>
              </>
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="resume-studio">
      <ConfirmDialog
        open={deleteTarget?.type === "template"}
        title="Delete resume template?"
        description={
          deleteTarget
            ? `“${deleteTarget.item.name}” will be permanently removed. Existing generated resumes will remain available.`
            : "This template will be permanently removed."
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await api(`/api/templates/${deleteTarget.item.id}`, {
            method: "DELETE",
          });
          if (templateId === deleteTarget.item.id)
            setTemplateId(
              state.templates.find((item) => item.id !== deleteTarget.item.id)
                ?.id || "",
            );
          await reload();
        }}
      />
      <ConfirmDialog
        open={deleteTarget?.type === "resume"}
        title="Delete resume version?"
        description={
          deleteTarget
            ? `“${deleteTarget.item.name}” will be permanently removed. Your base profile resume and template will remain available.`
            : "This generated resume will be permanently removed."
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await api(`/api/resumes/${deleteTarget.item.id}`, {
            method: "DELETE",
          });
          if (preview?.id === deleteTarget.item.id) setPreview(null);
          setDeleteTarget(null);
          await reload();
        }}
      />
      <div className="v2-ats-header">
        <div>
          <h2>ATS Resume Templates</h2>
          <p>
            {visibleTemplates.length} template
            {visibleTemplates.length === 1 ? "" : "s"} available
          </p>
        </div>
        <button onClick={() => openTemplateDialog()}>
          <Plus size={16} /> Create New Template
        </button>
      </div>
      <div className="v2-template-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Search resume templates"
            value={templateQuery}
            onChange={(event) => setTemplateQuery(event.target.value)}
            placeholder="Search templates..."
          />
        </div>
        <button className="text-button" onClick={reload}>
          <RefreshCcw size={15} /> Refresh
        </button>
        <button
          className={templateSort === "name" ? "secondary active" : "secondary"}
          aria-pressed={templateSort === "name"}
          onClick={() => sortTemplates("name")}
        >
          Name{" "}
          {templateSort === "name"
            ? templateSortOrder === "asc"
              ? "↑"
              : "↓"
            : ""}
        </button>
        <button
          className={
            templateSort === "modified" ? "secondary active" : "secondary"
          }
          aria-pressed={templateSort === "modified"}
          onClick={() => sortTemplates("modified")}
        >
          Modified{" "}
          {templateSort === "modified"
            ? templateSortOrder === "asc"
              ? "↑"
              : "↓"
            : ""}
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
              aria-label={`Edit ${template.name} template`}
              onClick={() => openTemplateDialog(template)}
            >
              <span className="v2-template-preview">
                <FileText size={26} />
                <i />
                <i />
                <i />
              </span>
              <span>
                <b>
                  {template.name}
                  {!template.originalResume &&
                    !["clean-ats", "impact", "career-switch"].includes(
                      template.id,
                    ) && <em className="v2-template-status">In Progress</em>}
                </b>
                <small>{template.description}</small>
                <small className="v2-template-metadata">
                  <Calendar size={12} /> Updated{" "}
                  {new Date(
                    template.updatedAt || template.createdAt || 0,
                  ).toLocaleDateString()}
                  <span>•</span> Local template
                </small>
                {template.additionalExperience && (
                  <small className="v2-template-enriched">
                    + Additional Experience
                  </small>
                )}
              </span>
            </button>
            <div className="v2-template-actions">
              <details>
                <summary aria-label={`Actions for ${template.name}`}>
                  <MoreHorizontal size={17} />
                </summary>
                <div>
                  <button onClick={() => openTemplateDialog(template)}>
                    Edit Template
                  </button>
                  <button
                    className="danger"
                    disabled={state.templates.length <= 1}
                    onClick={() =>
                      setDeleteTarget({ type: "template", item: template })
                    }
                  >
                    Delete
                  </button>
                </div>
              </details>
            </div>
          </div>
        ))}
        {!visibleTemplates.length && (
          <div className="v2-template-empty">
            <Search size={22} /> No templates match “{templateQuery}”.
          </div>
        )}
      </div>
      <details className="v2-manual-resume-builder">
        <summary>
          <span>
            <FileText size={18} />
            <b>Generate a resume manually</b>
            <small>
              Create a local resume version outside an Infinite Hunt run.
            </small>
          </span>
          <ChevronRight size={18} />
        </summary>
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
      </details>
      <div className="card document-library">
        <div className="v2-resume-history-head">
          <div>
            <h3>AI Resumes</h3>
            <p>{state.resumes.length} locally generated resumes</p>
          </div>
          <button className="secondary" onClick={reload}>
            <RefreshCcw size={15} /> Refresh
          </button>
        </div>
        <div className="v2-resume-history-toolbar">
          <div className="searchbox">
            <Search size={16} />
            <input
              aria-label="Search resume history"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search by company, job title, or location..."
            />
          </div>
          <select
            aria-label="Filter resume history by template"
            value={historyTemplate}
            onChange={(event) => setHistoryTemplate(event.target.value)}
          >
            <option value="all">All templates</option>
            {state.templates.map((template) => (
              <option value={template.id} key={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            onClick={() => setShowAllResumes((current) => !current)}
          >
            {showAllResumes ? "Show This Month" : "Show All"}
          </button>
        </div>
        {resumeGroups.length ? (
          <div className="v2-resume-groups">
            {resumeGroups.map(({ template, resumes }) => (
              <section key={template.id}>
                <div className="v2-resume-group-head">
                  <div>
                    <h4>{template.name}</h4>
                    <span>
                      {resumes.length} AI resume
                      {resumes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                {resumes.map((item) => {
                  const job = state.jobs.find(
                    (candidate) => candidate.id === item.jobId,
                  );
                  return (
                    <div
                      className={`v2-resume-history-row ${
                        preview?.id === item.id ? "selected" : ""
                      }`}
                      key={item.id}
                    >
                      <button
                        onClick={() => {
                          setPreview(item);
                          setResume(item.content);
                          setName(item.name);
                          setTemplateId(item.templateId);
                          if (item.jobId) setJobId(item.jobId);
                        }}
                      >
                        <b>
                          {job
                            ? `${job.title} @ ${job.company}`
                            : item.name || "AI Resume"}
                        </b>
                        <span>
                          {job?.location || "Local resume"} · Created{" "}
                          {new Date(
                            item.createdAt || item.updatedAt,
                          ).toLocaleDateString()}
                        </span>
                        <small>{item.name}</small>
                      </button>
                      {safeHttpUrl(job?.url) && (
                        <a
                          className="v2-resume-job-link"
                          href={safeHttpUrl(job.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View job post <ExternalLink size={12} />
                        </a>
                      )}
                      <a
                        className="v2-resume-download"
                        aria-label={`Download ${item.name} PDF`}
                        href={`/print/resume/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={16} />
                      </a>
                      <button
                        className="icon danger"
                        aria-label={`Delete ${item.name}`}
                        onClick={() =>
                          setDeleteTarget({ type: "resume", item })
                        }
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        ) : (
          <div className="v2-resume-history-empty">
            <FileText size={28} />
            <p>No AI resumes found.</p>
            <span>
              Generate a resume from one of your templates to see it here.
            </span>
          </div>
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
          onKeyDown={(event) => {
            if (event.key === "Escape") setTemplateDialog(null);
            containDialogFocus(event);
          }}
        >
          <button
            className="v2-template-backdrop"
            aria-label="Dismiss template editor"
            onClick={() => setTemplateDialog(null)}
          />
          <div className="v2-template-modal-content">
            <div className="v2-template-wizard-head">
              <div>
                <span>ATS TEMPLATE WIZARD</span>
                <h3 id="template-dialog-title">
                  {templateDialog.id ? "Edit Template" : "Create New Template"}
                </h3>
              </div>
              <div className="v2-template-wizard-meta">
                <small>Step {templateDialog.step} of 5</small>
                <button
                  className="v2-run-delete"
                  aria-label="Close template editor"
                  onClick={() => setTemplateDialog(null)}
                >
                  <X size={17} />
                </button>
              </div>
            </div>
            <ol
              className="v2-template-progress"
              aria-label="Template setup progress"
            >
              {["Upload", "Edit Clone", "Enrich Exp", "Test", "Result"].map(
                (label, index) => (
                  <li
                    key={label}
                    className={templateDialog.step >= index + 1 ? "active" : ""}
                    aria-current={
                      templateDialog.step === index + 1 ? "step" : undefined
                    }
                  >
                    <i>{index + 1}</i>
                    <span>{label}</span>
                  </li>
                ),
              )}
            </ol>
            {templateDialog.step === 1 && (
              <div className="v2-template-step v2-template-upload-step">
                <div>
                  <h4>Upload your resume</h4>
                  <p>
                    JobHuntr clones your existing resume before optimizing it.
                  </p>
                </div>
                <label>
                  Template name
                  <input
                    autoFocus
                    value={templateDialog.name}
                    onChange={(event) =>
                      setTemplateDialog({
                        ...templateDialog,
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="v2-template-dropzone">
                  <Upload size={30} />
                  <b>
                    {templateDialog.uploadedFileName || "Choose a resume file"}
                  </b>
                  <span>
                    PDF, HTML, or text · processed only on this device
                  </span>
                  <input
                    aria-label="Upload resume for ATS template"
                    type="file"
                    accept=".pdf,.html,.htm,.txt,text/plain,text/html,application/pdf"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const content =
                        file.type === "application/pdf"
                          ? state.profile.resumeText
                          : await file.text();
                      setTemplateDialog({
                        ...templateDialog,
                        uploadedFileName: file.name,
                        originalResume: content,
                        editedResume: content,
                      });
                    }}
                  />
                </label>
                {templateDialog.originalResume && (
                  <div className="v2-template-upload-success" role="status">
                    <CheckCircle2 size={18} /> Resume uploaded successfully and
                    ready to edit.
                  </div>
                )}
              </div>
            )}
            {templateDialog.step === 2 && (
              <div className="v2-template-step v2-template-edit-step">
                <div>
                  <h4>Edit your cloned resume</h4>
                  <p>
                    Correct conversion issues while preserving your original
                    content.
                  </p>
                </div>
                <textarea
                  aria-label="Cloned resume content"
                  value={templateDialog.editedResume}
                  onChange={(event) =>
                    setTemplateDialog({
                      ...templateDialog,
                      editedResume: event.target.value,
                    })
                  }
                />
                <small>
                  {templateDialog.editedResume.length.toLocaleString()}{" "}
                  characters
                </small>
              </div>
            )}
            {templateDialog.step === 3 && (
              <div className="v2-template-step v2-template-edit-step">
                <div>
                  <h4>Add Additional Experience</h4>
                  <p>
                    Add truthful skills, projects, achievements, or experience
                    not already included. JobHuntr never invents details.
                  </p>
                </div>
                <textarea
                  aria-label="Additional experience and skills"
                  maxLength={10000}
                  value={templateDialog.additionalExperience}
                  onChange={(event) =>
                    setTemplateDialog({
                      ...templateDialog,
                      additionalExperience: event.target.value,
                    })
                  }
                  placeholder="Freelance projects, certifications, volunteer leadership, awards, publications…"
                />
                <small>
                  {templateDialog.additionalExperience.length.toLocaleString()}
                  /10,000 characters
                </small>
              </div>
            )}
            {templateDialog.step === 4 && (
              <div className="v2-template-step">
                <div>
                  <h4>Test your ATS template</h4>
                  <p>
                    Select a tracked role to verify alignment before completing
                    the template.
                  </p>
                </div>
                <label>
                  Test job
                  <select
                    aria-label="ATS template test job"
                    value={templateDialog.testJobId}
                    onChange={(event) =>
                      setTemplateDialog({
                        ...templateDialog,
                        testJobId: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose a tracked job</option>
                    {state.jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} · {job.company}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="v2-template-test-summary">
                  <ShieldCheck size={24} />
                  <span>
                    <b>Private deterministic test</b>
                    <small>
                      Your resume and job data never leave this device.
                    </small>
                  </span>
                </div>
              </div>
            )}
            {templateDialog.step === 5 && (
              <div className="v2-template-step v2-template-result">
                <div>
                  <h4>ATS Optimization Complete</h4>
                  <p>
                    Your reusable template is ready for job-specific resumes.
                  </p>
                </div>
                <div className="v2-template-score">
                  <strong>{templateDialog.scoreResult?.score ?? 0}</strong>
                  <span>ATS match score</span>
                </div>
                <div className="v2-template-result-grid">
                  <div>
                    <b>Matched keywords</b>
                    <p>
                      {templateDialog.scoreResult?.keywordHits?.join(", ") ||
                        "No job keywords detected"}
                    </p>
                  </div>
                  <div>
                    <b>Suggested improvements</b>
                    <p>
                      {templateDialog.scoreResult?.suggestions?.[1] ||
                        "Keep experience specific and measurable."}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="v2-template-modal-actions">
              <button
                ref={templateDialogCloseRef}
                className="secondary"
                onClick={() =>
                  templateDialog.step === 1
                    ? setTemplateDialog(null)
                    : setTemplateDialog({
                        ...templateDialog,
                        step: templateDialog.step - 1,
                      })
                }
              >
                {templateDialog.step === 1 ? "Cancel" : "Previous"}
              </button>
              {templateDialog.step < 5 ? (
                <button
                  disabled={
                    (templateDialog.step === 1 &&
                      (!templateDialog.name.trim() ||
                        !templateDialog.originalResume.trim())) ||
                    (templateDialog.step === 2 &&
                      !templateDialog.editedResume.trim()) ||
                    (templateDialog.step === 4 && !templateDialog.testJobId)
                  }
                  onClick={advanceTemplateWizard}
                >
                  {templateDialog.step === 4 ? "Run ATS Test" : "Next"}{" "}
                  <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  disabled={!templateDialog.name.trim()}
                  onClick={saveTemplate}
                >
                  <Save size={16} /> Save Template
                </button>
              )}
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
  const [statuses, setStatuses] = useState([
    "draft",
    "sent",
    "replied",
    "archived",
  ]);
  const [categories, setCategories] = useState([
    "recruiter",
    "hiring_manager",
    "peer",
  ]);
  const [sort, setSort] = useState("newest");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteContact, setDeleteContact] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectFeedback, setCollectFeedback] = useState("");
  const connectCloseRef = useRef(null);
  const [draft, setDraft] = useState(
    state.outreachDrafts.find((item) => item.id === selectedId) || null,
  );
  useEffect(() => {
    if (!connectOpen) return undefined;
    const returnFocus = document.activeElement;
    connectCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setConnectOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [connectOpen]);
  const generate = async () => {
    setCollecting(true);
    setCollectFeedback("");
    try {
      const created = await api("/api/outreach/draft", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      setSelectedId(created.id);
      setDraft(created);
      setCollectFeedback(
        created.collectedCount
          ? `${created.collectedCount} contact${created.collectedCount === 1 ? "" : "s"} collected.`
          : "All contacts for this role are already collected.",
      );
      await reload();
    } finally {
      setCollecting(false);
    }
  };
  const visible = state.outreachDrafts
    .filter((item) => {
      const job = state.jobs.find((candidate) => candidate.id === item.jobId);
      return (
        statuses.includes(item.status || "draft") &&
        categories.includes(item.category || "peer") &&
        `${item.subject} ${item.recipient || ""} ${job?.company || ""} ${job?.title || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "oldest"
        ? new Date(a.createdAt) - new Date(b.createdAt)
        : sort === "company"
          ? (
              state.jobs.find((job) => job.id === a.jobId)?.company || ""
            ).localeCompare(
              state.jobs.find((job) => job.id === b.jobId)?.company || "",
            )
          : new Date(b.createdAt) - new Date(a.createdAt),
    );
  const selected =
    draft || visible.find((item) => item.id === selectedId) || visible[0];
  const allVisibleSelected =
    visible.length > 0 && visible.every((item) => selectedIds.has(item.id));
  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleOutreachFilter = (value, values, setter) =>
    setter(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  const markSelectedOutreached = async () => {
    setConnecting(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          api(`/api/outreach/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "sent" }),
          }),
        ),
      );
      setSelectedIds(new Set());
      setConnectOpen(false);
      setDraft(null);
      await reload();
    } finally {
      setConnecting(false);
    }
  };
  return (
    <section className="v2-outreach-page">
      <ConfirmDialog
        open={Boolean(deleteContact)}
        title="Delete outreach contact?"
        description={
          deleteContact
            ? `“${deleteContact.recipient || "Hiring team"}” and the saved connection message will be permanently removed.`
            : "This contact and saved connection message will be removed."
        }
        confirmLabel="Delete contact"
        onClose={() => setDeleteContact(null)}
        onConfirm={async () => {
          await api(`/api/outreach/${deleteContact.id}`, { method: "DELETE" });
          setSelectedId("");
          setDraft(null);
          setDeleteContact(null);
          await reload();
        }}
      />
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
          <button disabled={!jobId || collecting} onClick={generate}>
            <Users size={16} />{" "}
            {collecting ? "Collecting…" : "Collect contacts"}
          </button>
          <button
            disabled={!selectedIds.size}
            onClick={() => setConnectOpen(true)}
          >
            <MessageSquare size={16} />
            {selectedIds.size ? `Connect (${selectedIds.size})` : "Connect"}
          </button>
        </div>
      </div>
      {collectFeedback && (
        <div className="v2-save-notice" role="status">
          <CheckCircle2 size={16} /> {collectFeedback}
        </div>
      )}
      <div className="v2-outreach-summary-row">
        <div className="v2-outreach-stats" aria-label="Outreach summary">
          <div>
            <strong>{state.outreachDrafts.length}</strong>
            <span>Collected</span>
          </div>
          <div>
            <strong>
              {
                state.outreachDrafts.filter(
                  (item) => (item.status || "draft") === "draft",
                ).length
              }
            </strong>
            <span>Listed</span>
          </div>
          <div>
            <strong>
              {
                state.outreachDrafts.filter((item) => item.status === "sent")
                  .length
              }
            </strong>
            <span>Outreached</span>
          </div>
        </div>
        <div className="v2-outreach-summary-actions">
          <label className="check v2-show-messages">
            <input
              type="checkbox"
              checked={showMessages}
              onChange={(event) => setShowMessages(event.target.checked)}
            />
            Show Connection Messages
          </label>
          <button
            className={filtersOpen ? "secondary active" : "secondary"}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Filter size={16} /> Filters
          </button>
        </div>
      </div>
      {filtersOpen && (
        <div className="v2-outreach-filters">
          <fieldset>
            <legend>Contact status</legend>
            {[
              ["draft", "Listed"],
              ["sent", "Outreached"],
              ["replied", "Replied"],
              ["archived", "Archived"],
            ].map(([value, label]) => (
              <label className="check" key={value}>
                <input
                  type="checkbox"
                  checked={statuses.includes(value)}
                  onChange={() =>
                    toggleOutreachFilter(value, statuses, setStatuses)
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            Sort contacts
            <select
              aria-label="Sort contacts"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="company">Company A–Z</option>
            </select>
          </label>
          <fieldset>
            <legend>Contact category</legend>
            {[
              ["recruiter", "Recruiters"],
              ["hiring_manager", "Hiring managers"],
              ["peer", "Peers"],
            ].map(([value, label]) => (
              <label className="check" key={value}>
                <input
                  type="checkbox"
                  checked={categories.includes(value)}
                  onChange={() =>
                    toggleOutreachFilter(value, categories, setCategories)
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <button
            className="secondary"
            onClick={() => {
              setQuery("");
              setStatuses(["draft", "sent", "replied", "archived"]);
              setCategories(["recruiter", "hiring_manager", "peer"]);
              setSort("newest");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="searchbox v2-outreach-search">
        <Search size={16} />
        <input
          aria-label="Search outreach contacts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts, companies, or roles"
        />
      </div>
      <div className="v2-outreach-layout">
        <div className="card v2-contact-table">
          <div className="v2-contact-head">
            <input
              type="checkbox"
              aria-label="Select all visible contacts"
              checked={allVisibleSelected}
              onChange={() =>
                setSelectedIds(
                  allVisibleSelected
                    ? new Set()
                    : new Set(visible.map((item) => item.id)),
                )
              }
            />
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
                <div className="v2-contact-row" key={item.id}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.recipient || "hiring team"} at ${job?.company || "company"}`}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <button
                    className={selected?.id === item.id ? "selected" : ""}
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
                    <em>
                      {item.status === "sent"
                        ? "Outreached"
                        : item.status === "replied"
                          ? "Replied"
                          : item.status === "archived"
                            ? "Archived"
                            : "Listed"}
                    </em>
                  </button>
                </div>
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
                  <div className="chips v2-contact-metadata">
                    <span>
                      {(selected.category || "peer").replace("_", " ")}
                    </span>
                    <span>
                      {selected.connectionDegree || "Company contact"}
                    </span>
                    {selected.contactRole && (
                      <span>{selected.contactRole}</span>
                    )}
                  </div>
                </div>
                <button
                  className="danger v2-delete-contact"
                  aria-label={`Delete ${selected.recipient || "Hiring team"}`}
                  onClick={() => setDeleteContact(selected)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {selected.contactEmail && (
                <a
                  className="v2-contact-email"
                  href={`mailto:${selected.contactEmail}`}
                >
                  {selected.contactEmail}
                </a>
              )}
              {showMessages ? (
                <OutreachEditor
                  draft={selected}
                  setDraft={setDraft}
                  reload={reload}
                />
              ) : (
                <div className="v2-message-hidden">
                  <ShieldCheck size={22} />
                  <h3>Connection message hidden</h3>
                  <p>
                    Turn on Show Connection Messages to review and edit this
                    private draft.
                  </p>
                </div>
              )}
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
      {connectOpen && (
        <div
          className="v2-template-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-template-backdrop"
            aria-label="Close connect contacts dialog"
            onClick={() => setConnectOpen(false)}
          />
          <div className="v2-template-modal-content v2-connect-modal">
            <span className="v2-connect-icon">
              <MessageSquare size={22} />
            </span>
            <h3 id="connect-title">
              Connect to {selectedIds.size} contact
              {selectedIds.size === 1 ? "" : "s"}
            </h3>
            <p>
              Review the personalized messages before recording outreach.
              JobHuntr will not send anything automatically.
            </p>
            <div className="v2-connect-summary">
              <strong>{selectedIds.size}</strong>
              <span>selected contact{selectedIds.size === 1 ? "" : "s"}</span>
            </div>
            <div className="v2-template-modal-actions">
              <button
                ref={connectCloseRef}
                className="secondary"
                onClick={() => setConnectOpen(false)}
              >
                Cancel
              </button>
              <button disabled={connecting} onClick={markSelectedOutreached}>
                {connecting ? "Recording…" : "Mark as outreached"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function Coach({ state, reload }) {
  const [view, setView] = useState("chat");
  const [chatInput, setChatInput] = useState("");
  const [copiedMessage, setCopiedMessage] = useState(null);
  const [deleteConversationTarget, setDeleteConversationTarget] =
    useState(null);
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("jobhuntr-coach-conversations") || "[]",
      );
      if (saved.length) return saved;
      const legacy = JSON.parse(
        localStorage.getItem("jobhuntr-coach-chat") || "[]",
      );
      return legacy.length
        ? [
            {
              id: "migrated-coaching-session",
              title:
                legacy.find((message) => message.role === "user")?.content ||
                "Career coaching session",
              messages: legacy,
              updatedAt: new Date().toISOString(),
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState(() => {
    const linked = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    ).get("conversation");
    return linked || localStorage.getItem("jobhuntr-active-coach-conversation");
  });
  const [jobId, setJobId] = useState(
    state.jobs.find((j) => j.status === "interview")?.id ||
      state.jobs[0]?.id ||
      "",
  );
  const [session, setSession] = useState(state.coachingSessions[0] || null);
  const [draft, setDraft] = useState(state.outreachDrafts[0] || null);
  const activeConversation =
    conversations.find(({ id }) => id === activeConversationId) ||
    (activeConversationId ? conversations[0] || null : null);
  const messages = activeConversation?.messages || [];
  const persistConversations = (next, activeId = activeConversationId) => {
    setConversations(next);
    localStorage.setItem("jobhuntr-coach-conversations", JSON.stringify(next));
    if (activeId) {
      setActiveConversationId(activeId);
      localStorage.setItem("jobhuntr-active-coach-conversation", activeId);
    } else {
      setActiveConversationId(null);
      localStorage.removeItem("jobhuntr-active-coach-conversation");
    }
  };
  const newConversation = () => {
    setChatInput("");
    persistConversations(conversations, null);
  };
  const openConversation = (id) => {
    setChatInput("");
    setActiveConversationId(id);
    localStorage.setItem("jobhuntr-active-coach-conversation", id);
  };
  const deleteConversation = (id) => {
    const next = conversations.filter((conversation) => conversation.id !== id);
    const nextActive =
      id === activeConversation?.id
        ? next[0]?.id || null
        : activeConversationId;
    persistConversations(next, nextActive);
    setDeleteConversationTarget(null);
  };
  useEffect(() => {
    if (view !== "chat") return;
    const params = new URLSearchParams();
    if (activeConversation?.id)
      params.set("conversation", activeConversation.id);
    const hash = `#/coach${params.size ? `?${params}` : ""}`;
    if (window.location.hash !== hash)
      window.history.replaceState({ tab: "coach" }, "", hash);
  }, [view, activeConversation?.id]);
  useEffect(() => {
    const followConversationLink = () => {
      const id = new URLSearchParams(
        window.location.hash.split("?")[1] || "",
      ).get("conversation");
      if (id && conversations.some((conversation) => conversation.id === id))
        setActiveConversationId(id);
    };
    window.addEventListener("hashchange", followConversationLink);
    return () =>
      window.removeEventListener("hashchange", followConversationLink);
  }, [conversations]);
  const copyCoachText = async (content, index) => {
    await navigator.clipboard.writeText(content);
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage(null), 1800);
  };
  const shareConversation = async () => {
    if (!activeConversation?.id) return;
    const url = `${window.location.origin}${window.location.pathname}#/coach?conversation=${encodeURIComponent(activeConversation.id)}`;
    await navigator.clipboard.writeText(url);
    setCopiedMessage("share");
    window.setTimeout(() => setCopiedMessage(null), 1800);
  };
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
    const nextMessages = [
      ...messages,
      { role: "user", content: prompt },
      { role: "assistant", content: answer },
    ];
    const id = activeConversation?.id || crypto.randomUUID();
    const updated = {
      ...activeConversation,
      id,
      jobId,
      title:
        activeConversation?.title ||
        (prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt),
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    };
    const nextConversations = activeConversation
      ? conversations.map((conversation) =>
          conversation.id === id ? updated : conversation,
        )
      : [updated, ...conversations];
    persistConversations(nextConversations, id);
    setChatInput("");
  };
  return (
    <section className="coach-page">
      <ConfirmDialog
        open={Boolean(deleteConversationTarget)}
        title="Delete coaching conversation?"
        description={`“${deleteConversationTarget?.title || "This conversation"}” and its local message history will be permanently removed.`}
        confirmLabel="Delete conversation"
        onClose={() => setDeleteConversationTarget(null)}
        onConfirm={() => deleteConversation(deleteConversationTarget.id)}
      />
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
        <div className="v2-coach-workspace">
          <aside
            className="v2-coach-history card"
            aria-label="Coach conversations"
          >
            <div className="v2-coach-history-head">
              <div>
                <strong>Conversations</strong>
                <span>{conversations.length} saved locally</span>
              </div>
              <button
                className="icon-button"
                onClick={newConversation}
                aria-label="New coaching conversation"
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="v2-coach-history-list">
              {conversations.length === 0 ? (
                <p>Your coaching sessions will appear here.</p>
              ) : (
                conversations.map((conversation) => (
                  <div
                    className={`v2-coach-history-row ${conversation.id === activeConversation?.id ? "selected" : ""}`}
                    key={conversation.id}
                  >
                    <button
                      onClick={() => openConversation(conversation.id)}
                      aria-current={
                        conversation.id === activeConversation?.id
                          ? "page"
                          : undefined
                      }
                    >
                      <MessageSquare size={16} />
                      <span>
                        <strong>{conversation.title}</strong>
                        <small>
                          {conversation.messages.length / 2} coaching exchange
                          {conversation.messages.length === 2 ? "" : "s"}
                        </small>
                      </span>
                    </button>
                    <button
                      className="v2-coach-delete"
                      onClick={() => setDeleteConversationTarget(conversation)}
                      aria-label={`Delete ${conversation.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="v2-coach-private">
              <ShieldCheck size={16} />
              <span>
                <strong>Private by design</strong>Your chats stay on this
                device.
              </span>
            </div>
          </aside>
          <div className="v2-coach-chat card">
            {activeConversation && (
              <div className="v2-coach-chat-actions">
                <span>{activeConversation.title}</span>
                <button className="text-button" onClick={shareConversation}>
                  {copiedMessage === "share"
                    ? "Link copied"
                    : "Share conversation"}
                </button>
              </div>
            )}
            <div className="v2-coach-stage" aria-label="Coaching progress">
              <span className={messages.length ? "complete" : "active"}>1</span>
              <i />
              <span className={messages.length ? "active" : ""}>2</span>
              <i />
              <span>3</span>
              <small>
                {messages.length
                  ? "Build your action plan"
                  : "Choose your focus"}
              </small>
            </div>
            <div className="v2-coach-messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="v2-coach-welcome">
                  <div className="v2-coach-avatar">
                    <Sparkles size={24} />
                  </div>
                  <h2>Hi, I'm AI Coach!</h2>
                  <p>
                    I'm your private and personal AI career coach. My service is
                    fast and free. I can help sharpen your story, prepare for
                    interviews, and decide what to do next.
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
                    {message.role === "assistant" && (
                      <button
                        className="v2-coach-copy"
                        aria-label={`Copy coach response ${index + 1}`}
                        onClick={() => copyCoachText(message.content, index)}
                      >
                        {copiedMessage === index ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                        {copiedMessage === index ? "Copied" : "Copy"}
                      </button>
                    )}
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
              JobHuntr is an AI coach, not a licensed career counselor. Review
              important decisions with a professional.
            </small>
          </div>
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
    "waiting-approval",
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
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [campaignPreview, setCampaignPreview] = useState(null);
  const [campaignProposal, setCampaignProposal] = useState("");
  const [gigQuery, setGigQuery] = useState("");
  const [myGigQuery, setMyGigQuery] = useState("");
  const [myView, setMyView] = useState("table");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionFeedback, setActionFeedback] = useState("");
  const gigCloseRef = useRef(null);
  const campaignCloseRef = useRef(null);
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
  const advanceGig = async (id, status, message) => {
    await patch(id, { status });
    setActionFeedback(message);
  };
  const gigStatusLabel = (status) =>
    ({
      lead: "Reviewing Application",
      proposal: "Application Submitted",
      negotiation: "Application Approved",
      won: "Ready to Start",
      "in-progress": "In Progress",
      "waiting-approval": "Waiting for Approval",
      completed: "Payment Sent",
      lost: "Closed",
    })[status] || status;
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
        proposal: campaignProposal,
        source: "JobHuntr Gigs",
      }),
    });
    setSelected(created.id);
    setCampaignPreview(null);
    setCampaignProposal("");
    await reload();
  };
  const visibleTrackedGigs = state.gigs.filter((item) =>
    `${item.title} ${item.client} ${item.status}`
      .toLowerCase()
      .includes(myGigQuery.toLowerCase()),
  );
  const deleteGig = async () => {
    await api(`/api/gigs/${deleteTarget.id}`, { method: "DELETE" });
    setSelected(null);
    await reload();
  };
  useEffect(() => {
    if (!gig || myView !== "table") return undefined;
    gigCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !deleteTarget) setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [gig, myView, deleteTarget]);
  useEffect(() => {
    if (!campaignPreview) return undefined;
    const returnFocus = document.activeElement;
    campaignCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setCampaignPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [campaignPreview]);
  return (
    <section className="gigs-page">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete gig application?"
        description={
          deleteTarget
            ? `“${deleteTarget.title}” and its proposal, notes, and status history will be permanently removed.`
            : "This gig application will be permanently removed."
        }
        confirmLabel="Delete application"
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteGig}
      />
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
              <button
                onClick={() => {
                  setCampaignProposal("");
                  setCampaignPreview(item);
                }}
              >
                Apply Now
              </button>
            </article>
          ))}
        </div>
      </div>
      {campaignPreview && (
        <div
          className="v2-template-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gig-campaign-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-template-backdrop"
            aria-label="Close gig application"
            onClick={() => setCampaignPreview(null)}
          />
          <div className="v2-template-modal-content v2-gig-campaign-modal">
            <div className="v2-gig-campaign-modal-head">
              <span className="v2-gig-partner">
                {campaignPreview.client[0]}
              </span>
              <div>
                <small>GIG CAMPAIGN</small>
                <h2 id="gig-campaign-title">{campaignPreview.title}</h2>
                <p>by {campaignPreview.client}</p>
              </div>
              <strong>{money(campaignPreview.budget)}+ Cash</strong>
            </div>
            <section>
              <h3>Campaign description</h3>
              <p>{campaignPreview.description}</p>
              <div className="chips">
                {campaignPreview.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </section>
            <label>
              Why are you a good fit? <span>Optional</span>
              <textarea
                aria-label="Gig application pitch"
                value={campaignProposal}
                onChange={(event) => setCampaignProposal(event.target.value)}
                placeholder="Share relevant experience, your approach, and availability…"
              />
            </label>
            <div className="v2-gig-application-notice">
              <ShieldCheck size={18} />
              Your application and pitch are stored only in this local
              workspace.
            </div>
            <div className="v2-template-modal-actions">
              <button
                ref={campaignCloseRef}
                className="secondary"
                onClick={() => setCampaignPreview(null)}
              >
                Cancel
              </button>
              <button onClick={() => applyToGig(campaignPreview)}>
                Submit Application
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="v2-gigs-section-title">
        <div>
          <h3>My Gigs</h3>
          <p>
            Track freelance opportunities, applications, delivery, and earnings
            locally.
          </p>
        </div>
        <div className="segmented v2-gig-view-toggle">
          <button
            className={myView === "table" ? "active" : ""}
            onClick={() => setMyView("table")}
          >
            List
          </button>
          <button
            className={myView === "board" ? "active" : ""}
            onClick={() => setMyView("board")}
          >
            Board
          </button>
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
      <div className="searchbox v2-my-gig-search">
        <Search size={16} />
        <input
          aria-label="Search my gigs"
          value={myGigQuery}
          onChange={(event) => setMyGigQuery(event.target.value)}
          placeholder="Search applications by campaign, partner, or status…"
        />
      </div>
      {myView === "table" ? (
        <div className="card v2-gig-applications">
          <div className="v2-gig-table-head">
            <span>Campaign</span>
            <span>Earning</span>
            <span>Created</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {visibleTrackedGigs.map((item) => (
            <button key={item.id} onClick={() => setSelected(item.id)}>
              <span>
                <b>{item.title}</b>
                <small>by {item.client}</small>
              </span>
              <strong>{money(item.earned || item.budget)}</strong>
              <time>{new Date(item.createdAt).toLocaleDateString()}</time>
              <em className={`v2-gig-status ${item.status}`}>
                {gigStatusLabel(item.status)}
              </em>
              <span className="v2-gig-row-action">
                View <ChevronRight size={15} />
              </span>
            </button>
          ))}
          {!visibleTrackedGigs.length && (
            <div className="v2-gig-table-empty">
              <CircleDollarSign size={26} />
              <h3>
                {state.gigs.length
                  ? "No matching gigs"
                  : "No gig applications yet"}
              </h3>
              <p>
                {state.gigs.length
                  ? "Try a broader search."
                  : "Apply to an available campaign or add a private opportunity."}
              </p>
            </div>
          )}
        </div>
      ) : (
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
                {visibleTrackedGigs
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
                  aria-label="Close gig details"
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
              {safeHttpUrl(gig.url) && (
                <a href={safeHttpUrl(gig.url)} target="_blank" rel="noreferrer">
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
              <button className="danger" onClick={() => setDeleteTarget(gig)}>
                Delete gig
              </button>
            </div>
          )}
        </div>
      )}
      {myView === "table" && gig && (
        <div
          className="v2-template-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gig-detail-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-template-backdrop"
            aria-label="Close gig details"
            onClick={() => setSelected(null)}
          />
          <div className="v2-template-modal-content v2-gig-detail-modal">
            <div className="row">
              <span className={`pill ${gig.status}`}>{gig.status}</span>
              <button
                ref={gigCloseRef}
                className="drawer-close"
                aria-label="Close gig details"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <h2 id="gig-detail-title">{gig.title}</h2>
            <p className="muted">
              {gig.client} · {gig.source}
            </p>
            {actionFeedback && (
              <p className="v2-gig-action-feedback" role="status">
                <CheckCircle2 size={16} /> {actionFeedback}
              </p>
            )}
            <label>
              Application status
              <select
                aria-label="Gig application status"
                value={gig.status}
                onChange={(event) =>
                  patch(gig.id, { status: event.target.value })
                }
              >
                {stages.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            {["negotiation", "won"].includes(gig.status) && (
              <div className="v2-gig-next-action">
                <div>
                  <strong>Your application was approved</strong>
                  <p>Confirm when you are ready to begin this gig.</p>
                </div>
                <button
                  onClick={() =>
                    advanceGig(
                      gig.id,
                      "in-progress",
                      "Work started. You can now submit your delivery.",
                    )
                  }
                >
                  Start Work
                </button>
              </div>
            )}
            {gig.status === "in-progress" && (
              <div className="v2-gig-next-action">
                <div>
                  <strong>Ready to deliver?</strong>
                  <p>
                    Add delivery notes below, then submit your work for
                    approval.
                  </p>
                </div>
                <button
                  onClick={() =>
                    advanceGig(
                      gig.id,
                      "waiting-approval",
                      "Work submitted for approval.",
                    )
                  }
                >
                  Submit Work
                </button>
              </div>
            )}
            {gig.status === "waiting-approval" && (
              <div className="v2-gig-next-action pending">
                <div>
                  <strong>Waiting for approval</strong>
                  <p>
                    Your delivery was submitted. The campaign partner reviews it
                    next.
                  </p>
                </div>
              </div>
            )}
            {gig.status === "completed" && (
              <div className="v2-gig-next-action paid">
                <div>
                  <strong>Payment sent</strong>
                  <p>
                    This gig is complete. Record the actual earning above for
                    your totals.
                  </p>
                </div>
              </div>
            )}
            <div className="double">
              <label>
                Potential earning
                <input
                  type="number"
                  defaultValue={gig.budget}
                  onBlur={(event) =>
                    patch(gig.id, { budget: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Actual earning
                <input
                  type="number"
                  defaultValue={gig.earned}
                  onBlur={(event) =>
                    patch(gig.id, { earned: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              Deadline
              <input
                type="date"
                defaultValue={gig.dueDate || ""}
                onBlur={(event) =>
                  patch(gig.id, { dueDate: event.target.value })
                }
              />
            </label>
            <label>
              Proposal / delivery notes
              <textarea
                className="gig-proposal"
                defaultValue={gig.proposal}
                onBlur={(event) =>
                  patch(gig.id, { proposal: event.target.value })
                }
              />
            </label>
            <div className="v2-gig-modal-footer">
              <button className="danger" onClick={() => setDeleteTarget(gig)}>
                Close application
              </button>
              <button className="secondary" onClick={() => setSelected(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [expanded, setExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [form, setForm] = useState({
    profileUrl: "",
    targetContext: "",
    headline: state.profile.headline || "",
    about: "",
    experience: state.profile.resumeText || "",
    skills: (state.profile.skills || []).join(", "),
  });
  const [audit, setAudit] = useState(state.profileAudits[0] || null);
  const [deleteAudit, setDeleteAudit] = useState(null);
  const [running, setRunning] = useState(false);
  const profileUrlValid =
    !profileUrl.trim() ||
    /^https:\/\/(www\.)?linkedin\.com\/(in|pub)\/[^/?#]+/i.test(
      profileUrl.trim(),
    );
  const run = async () => {
    setRunning(true);
    try {
      const result = await api("/api/profile-audits", {
        method: "POST",
        body: JSON.stringify({ ...form, profileUrl }),
      });
      setAudit(result);
      await reload();
    } finally {
      setRunning(false);
    }
  };
  return (
    <section className="v2-audit-page">
      <ConfirmDialog
        open={Boolean(deleteAudit)}
        title="Delete profile audit?"
        description="This saved score, rubric, and recommendation history will be permanently removed."
        onClose={() => setDeleteAudit(null)}
        onConfirm={async () => {
          await api(`/api/profile-audits/${deleteAudit.id}`, {
            method: "DELETE",
          });
          if (audit?.id === deleteAudit.id) setAudit(null);
          setDeleteAudit(null);
          await reload();
        }}
      />
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
        <label>
          LinkedIn profile URL <span>Optional reference</span>
          <input
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !running &&
                form.headline.trim() &&
                profileUrlValid
              )
                run();
            }}
            placeholder="https://www.linkedin.com/in/username"
            inputMode="url"
            aria-invalid={!profileUrlValid}
          />
        </label>
        <button
          disabled={running || !form.headline.trim() || !profileUrlValid}
          onClick={run}
        >
          {running ? "Analyzing…" : "Analyze Profile"}
        </button>
      </div>
      {!profileUrlValid && (
        <p className="v2-audit-url-error" role="alert">
          Enter a valid LinkedIn profile URL, such as
          https://www.linkedin.com/in/username.
        </p>
      )}
      <button
        className="v2-target-context-toggle v2-audit-context-toggle"
        aria-expanded={contextExpanded}
        onClick={() => setContextExpanded((value) => !value)}
      >
        <span>
          {contextExpanded ? "Hide" : "Show"} Additional Context (Optional)
        </span>
        <ChevronRight className={contextExpanded ? "rotated" : ""} size={17} />
      </button>
      {contextExpanded && (
        <label className="v2-audit-context-field">
          How would you like to improve your LinkedIn profile? (e.g., enter your
          targeted job&apos;s description)
          <textarea
            value={form.targetContext}
            onChange={(event) =>
              setForm({ ...form, targetContext: event.target.value })
            }
            placeholder="Paste your target job description, specific goals, or areas you would like to focus on…"
          />
          <small>
            Providing context helps tailor feedback to your specific goals.
          </small>
        </label>
      )}
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
        <span>{expanded ? "Hide" : "Show"} pasted profile content</span>
        <ChevronRight className={expanded ? "rotated" : ""} size={18} />
      </button>
      <div className={expanded ? "audit-layout" : "audit-layout collapsed"}>
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
            <small className="v2-field-count">
              {form.headline.length} characters
            </small>
            <label>
              About section
              <textarea
                value={form.about}
                onChange={(e) => setForm({ ...form, about: e.target.value })}
                placeholder="Your positioning, evidence, motivation, and call to action…"
              />
            </label>
            <small className="v2-field-count">
              {form.about.trim().split(/\s+/).filter(Boolean).length} words
            </small>
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
            <small className="v2-field-count">
              {form.experience.trim().split(/\s+/).filter(Boolean).length} words
            </small>
            <label>
              Skills, comma-separated
              <input
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
              />
            </label>
            <p className="hint">
              JobHuntr does not open LinkedIn, use cookies, or transmit this
              content.
            </p>
          </div>
        )}
        <div className="audit-results">
          {running ? (
            <div className="card v2-audit-loading" role="status">
              <span className="v2-loading-orb">
                <Search size={22} />
              </span>
              <h3>Analyzing your profile…</h3>
              <p>
                Reviewing positioning, evidence, target language, and section
                completeness.
              </p>
              <i />
              <i />
              <i />
            </div>
          ) : audit ? (
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
                      setProfileUrl(item.input.profileUrl || "");
                      setContextExpanded(Boolean(item.input.targetContext));
                      setForm({
                        profileUrl: item.input.profileUrl || "",
                        targetContext: item.input.targetContext || "",
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
                    aria-label={`Delete profile audit from ${new Date(item.createdAt).toLocaleDateString()}`}
                    onClick={() => setDeleteAudit(item)}
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
  const [newRunDraft] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("jobhuntr-new-run-draft") || "null",
      );
    } catch {
      return null;
    }
  });
  const defaults = {
    q: newRunDraft?.q || state.profile.targetRoles?.[0] || "Software Engineer",
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
      return Array.isArray(newRunDraft?.workflows) &&
        newRunDraft.workflows.length
        ? newRunDraft.workflows
        : Array.isArray(saved) && saved.length
          ? saved
          : ["linkedin", "indeed"];
    } catch {
      return ["linkedin", "indeed"];
    }
  });
  const [optimizeResume, setOptimizeResume] = useState(
    () =>
      newRunDraft?.optimizeResume ??
      localStorage.getItem("jobhuntr-optimize-resume") === "true",
  );
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetSaved, setPresetSaved] = useState(false);
  const [deletePreset, setDeletePreset] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusCloseRef = useRef(null);
  const latestRun = state.agentRuns[0] || null;
  useEffect(() => {
    if (!newRunDraft) return;
    localStorage.setItem(
      "jobhuntr-infinite-workflows",
      JSON.stringify(newRunDraft.workflows),
    );
    localStorage.setItem(
      "jobhuntr-optimize-resume",
      String(Boolean(newRunDraft.optimizeResume)),
    );
  }, [newRunDraft]);
  useEffect(() => {
    if (!statusOpen) return undefined;
    const returnFocus = document.activeElement;
    statusCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setStatusOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [statusOpen]);
  const payload = () => ({
    runName: newRunDraft?.runName || form.q,
    origin: newRunDraft?.origin || "infinite",
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
      localStorage.removeItem("jobhuntr-new-run-draft");
      await reload();
    } finally {
      setRunning(false);
    }
  };
  const previewMatches = async () => {
    if (previewing) return;
    setPreviewing(true);
    try {
      setPreview(
        await api("/api/agent-runs/preview", {
          method: "POST",
          body: JSON.stringify(payload()),
        }),
      );
    } finally {
      setPreviewing(false);
    }
  };
  const savePreset = async () => {
    if (savingPreset) return;
    setSavingPreset(true);
    setPresetSaved(false);
    try {
      await api("/api/hunt-presets", {
        method: "POST",
        body: JSON.stringify({ ...payload(), name: form.q }),
      });
      await reload();
      setPresetSaved(true);
    } finally {
      setSavingPreset(false);
    }
  };
  const workflows = HUNT_WORKFLOWS;
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
      <ConfirmDialog
        open={Boolean(deletePreset)}
        title="Delete hunt preset?"
        description={
          deletePreset
            ? `“${deletePreset.name}” will be permanently removed. Existing run history is unaffected.`
            : "This saved hunt preset will be permanently removed."
        }
        onClose={() => setDeletePreset(null)}
        onConfirm={async () => {
          await api(`/api/hunt-presets/${deletePreset.id}`, {
            method: "DELETE",
          });
          setDeletePreset(null);
          await reload();
        }}
      />
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
            disabled={previewing || running || selectedRuns.length === 0}
            onClick={previewMatches}
          >
            {previewing ? "Previewing matches…" : "Preview matches"}
          </button>
          <button disabled={running || selectedRuns.length === 0} onClick={run}>
            <InfinityIcon size={17} />
            {running ? "Starting infinite hunt…" : "Start infinite hunt"}
          </button>
        </div>
        <button
          className="text-button"
          disabled={savingPreset || !form.q.trim()}
          onClick={savePreset}
        >
          {savingPreset ? "Saving preset…" : "Save as preset"}
        </button>
        {presetSaved && (
          <span className="v2-inline-success" role="status">
            <CheckCircle2 size={14} /> Preset saved locally
          </span>
        )}
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
                    aria-label={`Delete ${preset.name} preset`}
                    onClick={() => setDeletePreset(preset)}
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
          onKeyDown={containDialogFocus}
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
function RunsPage({ state, setTab, reload }) {
  const runs = state.agentRuns;
  const linkedRunId = new URLSearchParams(
    window.location.hash.split("?")[1] || "",
  ).get("run");
  const [query, setQuery] = useState("");
  const [hideZero, setHideZero] = useState(false);
  const [showManualOnly, setShowManualOnly] = useState(false);
  const [showActionRequiredOnly, setShowActionRequiredOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [newRunTemplate, setNewRunTemplate] = useState("linkedin");
  const [newRunName, setNewRunName] = useState(
    state.profile.targetRoles?.[0] || "Software Engineer",
  );
  const [newRunOptimize, setNewRunOptimize] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectedRun, setSelectedRun] = useState(
    () => runs.find((run) => run.id === linkedRunId) || null,
  );
  const [deleteIds, setDeleteIds] = useState([]);
  const runCloseRef = useRef(null);
  const actionRequiredRunIds = new Set(
    state.submissions
      .filter((submission) => ["draft", "ready"].includes(submission.status))
      .map(
        (submission) =>
          submission.workflowRunId ||
          state.jobs.find((job) => job.id === submission.jobId)?.workflowRunId,
      )
      .filter(Boolean),
  );
  const filteredRuns = runs
    .filter((run) => {
      const matchesSearch =
        `${run.runName || ""} ${run.search?.q || ""} ${run.search?.location || ""} ${(run.workflows || []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase());
      return (
        matchesSearch &&
        (!showManualOnly ||
          run.origin === "manual" ||
          run.options?.origin === "manual") &&
        (!hideZero || (run.found || 0) > 0) &&
        (!showActionRequiredOnly || actionRequiredRunIds.has(run.id))
      );
    })
    .sort(
      (a, b) =>
        Number(actionRequiredRunIds.has(b.id)) -
        Number(actionRequiredRunIds.has(a.id)),
    );
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const visibleRuns = filteredRuns.slice(
    (effectivePage - 1) * pageSize,
    effectivePage * pageSize,
  );
  const toggleRun = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleVisible = () => {
    const allSelected =
      visibleRuns.length > 0 &&
      visibleRuns.every((run) => selectedIds.has(run.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleRuns.forEach((run) =>
        allSelected ? next.delete(run.id) : next.add(run.id),
      );
      return next;
    });
  };
  const deleteRuns = async () => {
    await Promise.all(
      deleteIds.map((id) => api(`/api/agent-runs/${id}`, { method: "DELETE" })),
    );
    setSelectedRun(null);
    setSelectedIds(new Set());
    setDeleteIds([]);
    await reload();
  };
  useEffect(() => {
    if (!selectedRun) return undefined;
    const returnFocus = document.activeElement;
    runCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedRun(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [selectedRun]);
  useEffect(() => {
    const hash = selectedRun ? `#/runs?run=${selectedRun.id}` : "#/runs";
    if (window.location.hash !== hash)
      window.history.replaceState({ tab: "runs" }, "", hash);
  }, [selectedRun]);
  useEffect(() => {
    const followLinkedRun = () => {
      const id = new URLSearchParams(
        window.location.hash.split("?")[1] || "",
      ).get("run");
      if (id) setSelectedRun(runs.find((run) => run.id === id) || null);
    };
    window.addEventListener("hashchange", followLinkedRun);
    return () => window.removeEventListener("hashchange", followLinkedRun);
  }, [runs]);
  return (
    <section className="v2-runs-page">
      <div className="v2-page-intro">
        <div>
          <h2>Agent Runs</h2>
          <p>Manage and monitor your job hunting agent runs</p>
        </div>
        <div className="inline">
          <button
            className="secondary"
            disabled={!runs.length}
            onClick={() => setSelectedRun(runs[0])}
          >
            Open Latest Run
          </button>
          <button onClick={() => setNewRunOpen(true)}>
            <Plus size={16} /> New Run
          </button>
        </div>
      </div>
      <div className="v2-runs-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            aria-label="Search runs"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search runs..."
          />
        </div>
        <label className="v2-switch-control">
          <button
            type="button"
            role="switch"
            aria-checked={showManualOnly}
            onClick={() => {
              setShowManualOnly((value) => !value);
              setCurrentPage(1);
            }}
          >
            <span />
          </button>
          Manual Only
        </label>
        <label className="v2-switch-control">
          <button
            type="button"
            role="switch"
            aria-checked={hideZero}
            onClick={() => {
              setHideZero((value) => !value);
              setCurrentPage(1);
            }}
          >
            <span />
          </button>
          Hide 0 Apps
        </label>
        {actionRequiredRunIds.size > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={showActionRequiredOnly}
              onChange={(event) => {
                setShowActionRequiredOnly(event.target.checked);
                setCurrentPage(1);
              }}
            />
            Action required only
          </label>
        )}
      </div>
      <p className="v2-runs-filter-caption">
        {showManualOnly
          ? "Viewing manual runs created by you."
          : "Viewing all runs (manual + infinite hunt)."}
        {hideZero && " Runs with 0 applications are hidden."}
      </p>
      {selectedIds.size > 0 && (
        <div className="v2-run-selection" role="status">
          <strong>
            {selectedIds.size} agent run{selectedIds.size === 1 ? "" : "s"}{" "}
            selected
          </strong>
          <button
            className="secondary"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </button>
          <button
            className="danger secondary"
            onClick={() => setDeleteIds([...selectedIds])}
          >
            <Trash2 size={15} /> Delete selected
          </button>
        </div>
      )}
      <div className="card v2-runs-table">
        <div className="v2-table-head">
          <input
            aria-label="Select all visible runs"
            type="checkbox"
            checked={
              visibleRuns.length > 0 &&
              visibleRuns.every((run) => selectedIds.has(run.id))
            }
            onChange={toggleVisible}
          />
          <span>Run Name</span>
          <span>Type</span>
          <span>Last Update</span>
          <span>Applications</span>
          <span>Actions</span>
        </div>
        {visibleRuns.map((run) => (
          <div className="v2-run-row" key={run.id}>
            <input
              aria-label={`Select ${run.search?.q || "run"}`}
              type="checkbox"
              checked={selectedIds.has(run.id)}
              onChange={() => toggleRun(run.id)}
            />
            <span>
              <button
                className="v2-run-link"
                onClick={() => setSelectedRun(run)}
              >
                {run.runName || run.search?.q || "Local hunt"}
              </button>
              <small>{run.id.slice(0, 8)}...</small>
              {!!run.search?.location && <small>{run.search.location}</small>}
              {actionRequiredRunIds.has(run.id) && (
                <small className="v2-run-action-required">
                  Action required
                </small>
              )}
            </span>
            <span>{run.options?.autoApply ? "Apply" : "Search"}</span>
            <time>{formatRelativeTime(run.completedAt || run.createdAt)}</time>
            <strong>{run.added ?? run.found ?? 0}</strong>
            <div className="v2-run-action-menu">
              <button
                className="v2-run-delete"
                aria-label={`Actions for ${run.runName || run.search?.q || "run"}`}
                aria-expanded={actionMenuOpen === run.id}
                onClick={() =>
                  setActionMenuOpen((open) => (open === run.id ? null : run.id))
                }
              >
                <MoreHorizontal size={16} />
              </button>
              {actionMenuOpen === run.id && (
                <div role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setDeleteIds([run.id]);
                      setActionMenuOpen(null);
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!visibleRuns.length && (
          <div className="v2-empty">
            {runs.length ? <Search /> : <Bot />}
            <h3>{runs.length ? "No matching runs" : "No runs yet"}</h3>
            <p>
              {runs.length
                ? "Try a broader search or show runs with zero matches."
                : "Start an Infinite Hunt to see its progress and results here."}
            </p>
            {!runs.length && (
              <button onClick={() => setTab("agent")}>
                Create your first run
              </button>
            )}
          </div>
        )}
      </div>
      {filteredRuns.length > pageSize && (
        <div className="v2-runs-pagination">
          <span>
            Showing {(effectivePage - 1) * pageSize + 1} to{" "}
            {Math.min(effectivePage * pageSize, filteredRuns.length)} of{" "}
            {filteredRuns.length} runs
          </span>
          <div>
            <button
              className="secondary"
              disabled={effectivePage === 1}
              onClick={() => setCurrentPage(Math.max(1, effectivePage - 1))}
            >
              <ChevronLeft size={15} /> Previous
            </button>
            <button
              className="secondary"
              disabled={effectivePage === totalPages}
              onClick={() =>
                setCurrentPage(Math.min(totalPages, effectivePage + 1))
              }
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
      {selectedRun && (
        <div
          className="v2-session-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="run-detail-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-session-backdrop"
            aria-label="Close run details"
            onClick={() => setSelectedRun(null)}
          />
          <div className="v2-session-content v2-run-detail-modal">
            <div className="v2-session-head">
              <div>
                <span>AGENT RUN</span>
                <h3 id="run-detail-title">
                  {selectedRun.runName || selectedRun.search?.q || "Local hunt"}
                </h3>
              </div>
              <span className="pill submitted">Completed</span>
            </div>
            <p className="v2-session-time">
              {selectedRun.search?.location || "All locations"} · Started{" "}
              {new Date(selectedRun.createdAt).toLocaleString()}
            </p>
            <div className="v2-session-stats">
              <div>
                <strong>{selectedRun.inspected || 0}</strong>
                <span>Evaluated</span>
              </div>
              <div>
                <strong>{selectedRun.found || 0}</strong>
                <span>Matched</span>
              </div>
              <div>
                <strong>{selectedRun.added || 0}</strong>
                <span>Saved</span>
              </div>
              <div>
                <strong>{selectedRun.duplicates || 0}</strong>
                <span>Duplicates</span>
              </div>
            </div>
            <div className="v2-run-config">
              <span>
                <b>Workflows</b>
                {(selectedRun.workflows || []).join(" → ") || "Local catalog"}
              </span>
              <span>
                <b>Minimum fit</b>
                {selectedRun.minFit || selectedRun.options?.minFit || 0}%
              </span>
              <span>
                <b>Resume optimization</b>
                {selectedRun.optimizeResume ? "On" : "Off"}
              </span>
            </div>
            <div className="v2-run-detail-columns">
              <div>
                <h4>Workflow progress</h4>
                <div className="v2-session-steps">
                  {(selectedRun.steps || []).map((step) => (
                    <div key={step.name}>
                      <CheckCircle2 size={16} />
                      <span>
                        <b>{step.name}</b>
                        <small>{step.detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4>Matched jobs</h4>
                <div className="v2-run-matches">
                  {(selectedRun.matches || []).map((match) => (
                    <div key={match.url || `${match.company}-${match.title}`}>
                      <span>
                        <b>{match.title}</b>
                        <small>
                          {match.company} · {match.location}
                        </small>
                      </span>
                      <strong>{match.fitScore}%</strong>
                    </div>
                  ))}
                  {!selectedRun.matches?.length && (
                    <p>No jobs matched this run.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="v2-session-actions">
              <button
                className="danger secondary"
                onClick={() => setDeleteIds([selectedRun.id])}
              >
                <Trash2 size={15} /> Delete run
              </button>
              <button
                ref={runCloseRef}
                className="secondary"
                onClick={() => setSelectedRun(null)}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedRun(null);
                  setTab("agent");
                }}
              >
                Run again
              </button>
            </div>
          </div>
        </div>
      )}
      {newRunOpen && (
        <div
          className="v2-session-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-agent-run-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") setNewRunOpen(false);
            containDialogFocus(event);
          }}
        >
          <button
            className="v2-session-backdrop"
            aria-label="Close new agent run"
            onClick={() => setNewRunOpen(false)}
          />
          <div className="v2-session-content v2-new-run-modal">
            <div className="v2-new-run-head">
              <div>
                <span>NEW WORKFLOW</span>
                <h3 id="new-agent-run-title">Create New Agent Run</h3>
              </div>
              <button
                className="v2-run-delete"
                aria-label="Close"
                autoFocus
                onClick={() => setNewRunOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Choose a search workflow, then configure it in Infinite Hunting.
            </p>
            <div
              className="v2-new-run-templates"
              role="radiogroup"
              aria-label="Run template"
            >
              {HUNT_WORKFLOWS.map(([id, mark, name, description]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={newRunTemplate === id}
                  className={newRunTemplate === id ? "selected" : ""}
                  key={id}
                  onClick={() => setNewRunTemplate(id)}
                >
                  <span className={`v2-platform-mark ${id}`}>{mark}</span>
                  <span>
                    <strong>
                      {id === "company"
                        ? "Company Website Search"
                        : `${name.replace(" Jobs", "")} Auto Search`}
                    </strong>
                    <small>{description}</small>
                  </span>
                  <i>{newRunTemplate === id ? "✓" : ""}</i>
                </button>
              ))}
            </div>
            <label>
              Run Name
              <input
                value={newRunName}
                onChange={(event) => setNewRunName(event.target.value)}
                placeholder="Software Engineer"
              />
            </label>
            <label className="v2-check-row v2-new-run-option">
              <input
                type="checkbox"
                checked={newRunOptimize}
                onChange={(event) => setNewRunOptimize(event.target.checked)}
              />
              <span>
                <strong>Generate ATS-optimized resumes</strong>
                <small>
                  Create a tailored resume for matching queued jobs.
                </small>
              </span>
            </label>
            <div className="v2-session-actions">
              <button
                className="secondary"
                onClick={() => setNewRunOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={!newRunName.trim()}
                onClick={() => {
                  localStorage.setItem(
                    "jobhuntr-new-run-draft",
                    JSON.stringify({
                      runName: newRunName.trim(),
                      origin: "manual",
                      workflows: [newRunTemplate],
                      optimizeResume: newRunOptimize,
                    }),
                  );
                  setNewRunOpen(false);
                  setTab("agent");
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteIds.length > 0}
        title={`Delete ${deleteIds.length === 1 ? "agent run" : `${deleteIds.length} agent runs`}?`}
        description="This permanently removes the selected run history. Saved jobs and application packets are not deleted."
        confirmLabel={deleteIds.length === 1 ? "Delete run" : "Delete runs"}
        onClose={() => setDeleteIds([])}
        onConfirm={deleteRuns}
      />
    </section>
  );
}
function SettingsPage({ state, reload, setTab }) {
  const p = state.profile;
  const [activeTab, setActiveTab] = useState(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const linkedTab = new URLSearchParams(hashQuery).get("tab");
    const pending = sessionStorage.getItem("jobhuntr-user-tab");
    sessionStorage.removeItem("jobhuntr-user-tab");
    return ["profile", "coaches", "about", "settings"].includes(linkedTab)
      ? linkedTab
      : ["profile", "coaches", "about", "settings"].includes(pending)
        ? pending
        : "profile";
  });
  const [saved, setSaved] = useState(false);
  const [faqDeleteMode, setFaqDeleteMode] = useState(false);
  const [faqDeleteTarget, setFaqDeleteTarget] = useState(null);
  const [form, setForm] = useState({
    ...p,
    firstName: p.firstName || (p.name || "").trim().split(/\s+/)[0] || "",
    lastName:
      p.lastName || (p.name || "").trim().split(/\s+/).slice(1).join(" "),
    nickname:
      p.nickname || (p.name || "").trim().split(/\s+/)[0] || "Job Hunter",
    skills: (p.skills || []).join(", "),
    targetRoles: (p.targetRoles || []).join(", "),
    locations: (p.preferences?.locations || []).join(", "),
    remote: p.preferences?.remote,
    minSalary: p.preferences?.minSalary,
    atsThreshold: p.preferences?.atsThreshold ?? 80,
    weeklyApplicationGoal: p.preferences?.weeklyApplicationGoal || 5,
    resumeText: p.resumeText || "",
    additionalInfo: p.additionalInfo || "",
    faqAnswers: p.faqAnswers || [],
  });
  const save = async () => {
    setSaved(false);
    const fullName = `${form.firstName || ""} ${form.lastName || ""}`.trim();
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        onboarded: true,
        name: fullName || form.name,
        firstName: form.firstName,
        lastName: form.lastName,
        nickname: form.nickname,
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
          atsThreshold: Number(form.atsThreshold) || 80,
        },
        resumeText: form.resumeText,
        additionalInfo: form.additionalInfo,
        faqAnswers: form.faqAnswers,
      }),
    });
    await reload();
    setSaved(true);
  };
  const profileDisplayName =
    `${form.firstName || ""} ${form.lastName || ""}`.trim() ||
    form.name ||
    "Job Hunter";
  const usage = [
    ["AI Resumes", state.resumes.length, "versions created"],
    ["Cover Letters", state.coverLetters.length, "letters created"],
    ["Infinite Hunts", state.agentRuns.length, "runs completed"],
    ["Tracked Jobs", state.jobs.length, "opportunities saved"],
  ];
  const generateFaq = () => {
    const resume = `${form.resumeText} ${form.additionalInfo}`.toLowerCase();
    const questions = [
      "Why are you interested in this role?",
      "What experience makes you a strong fit?",
      "What are your salary expectations?",
      "When are you available to start?",
      "Will you require work authorization sponsorship?",
      ...(resume.includes("lead") || resume.includes("manager")
        ? ["Describe your leadership style and experience."]
        : []),
      ...(resume.includes("remote")
        ? ["What is your preferred working arrangement?"]
        : []),
    ];
    setForm({
      ...form,
      faqAnswers: questions.map((question, index) => ({
        id: `faq-${Date.now()}-${index}`,
        question,
        answer: "",
      })),
    });
    setFaqDeleteMode(false);
  };
  useEffect(() => {
    const syncTabFromHistory = () => {
      const hashQuery = window.location.hash.split("?")[1] || "";
      const linkedTab = new URLSearchParams(hashQuery).get("tab");
      if (["profile", "coaches", "about", "settings"].includes(linkedTab))
        setActiveTab(linkedTab);
    };
    window.addEventListener("hashchange", syncTabFromHistory);
    window.addEventListener("popstate", syncTabFromHistory);
    return () => {
      window.removeEventListener("hashchange", syncTabFromHistory);
      window.removeEventListener("popstate", syncTabFromHistory);
    };
  }, []);
  const selectTab = (nextTab) => {
    setActiveTab(nextTab);
    setSaved(false);
    const nextHash = `#/settings?tab=${encodeURIComponent(nextTab)}`;
    if (window.location.hash !== nextHash)
      window.history.pushState(
        { tab: "settings", userTab: nextTab },
        "",
        nextHash,
      );
  };
  return (
    <section className="v2-settings-page">
      <ConfirmDialog
        open={Boolean(faqDeleteTarget)}
        title="Delete FAQ question?"
        description={
          faqDeleteTarget
            ? `“${faqDeleteTarget.question}” and its saved answer will be removed from About Me.`
            : "This saved FAQ answer will be removed."
        }
        confirmLabel="Delete question"
        onClose={() => setFaqDeleteTarget(null)}
        onConfirm={async () => {
          const faqAnswers = form.faqAnswers.filter(
            (_, index) => index !== faqDeleteTarget.index,
          );
          setForm((current) => ({ ...current, faqAnswers }));
          setFaqDeleteTarget(null);
          setSaved(false);
          await api("/api/profile", {
            method: "PUT",
            body: JSON.stringify({ ...p, faqAnswers }),
          });
          await reload();
          setSaved(true);
        }}
      />
      <div className="v2-page-intro">
        <div>
          <h2>User Center</h2>
          <p>
            Manage your profile, usage, coaches, and teach JobHuntr about
            yourself.
          </p>
        </div>
      </div>
      <div className="v2-user-tabs" role="tablist" aria-label="User Center">
        {[
          ["profile", "Profile & Usage"],
          ["coaches", "Coaches"],
          ["about", "About Me"],
          ["settings", "Settings"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={activeTab === value}
            onClick={() => selectTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {saved && (
        <div className="v2-save-notice" role="status">
          <CheckCircle2 size={16} /> Changes saved locally.
        </div>
      )}
      {activeTab === "profile" && (
        <div className="card v2-user-profile-card" role="tabpanel">
          <h3>Profile Information</h3>
          <div className="v2-user-identity">
            <span className="v2-user-avatar-large">
              {profileDisplayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h3>{profileDisplayName}</h3>
              <p>{form.headline || "Add your professional headline"}</p>
              <small>{form.location || "Location not set"}</small>
            </div>
          </div>
          <div className="v2-user-details-section">
            <h4>Personal details</h4>
            <div className="v2-user-details-grid personal">
              {[
                ["firstName", "First name", "First name"],
                ["lastName", "Last name", "Last name"],
                ["nickname", "Nickname (for job cards)", "Your nickname"],
              ].map(([key, label, placeholder]) => (
                <label key={key}>
                  {label}
                  <input
                    value={form[key] || ""}
                    placeholder={placeholder}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  />
                  {key === "nickname" && (
                    <small>Shown on local leaderboards and job cards.</small>
                  )}
                </label>
              ))}
            </div>
          </div>
          <div className="v2-user-details-section professional">
            <h4>Professional details</h4>
            <div className="v2-user-details-grid">
              {["headline", "location"].map((key) => (
                <label key={key}>
                  {key === "headline" ? "Professional headline" : "Location"}
                  <input
                    value={form[key] || ""}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <button onClick={save}>
            <Save size={16} /> Save profile
          </button>
          <div className="v2-usage-section">
            <div>
              <h3>Usage</h3>
              <p>Your activity in this private local workspace.</p>
            </div>
            <span className="pill completed">Local plan</span>
          </div>
          <div className="v2-usage-grid">
            {usage.map(([label, value, detail]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </div>
      )}
      {activeTab === "coaches" && (
        <div className="v2-user-coaches" role="tabpanel">
          <div className="card v2-coach-access-card">
            <div className="v2-coach-avatar">
              <Sparkles size={22} />
            </div>
            <div>
              <span className="eyebrow">PRIVATE COACHING WORKSPACE</span>
              <h3>JobHuntr AI Coach</h3>
              <p>
                Practice interviews, organize career evidence, and turn your
                experience into stronger answers—all inside your local
                workspace.
              </p>
              <div className="chips">
                <span>Interview practice</span>
                <span>STAR stories</span>
                <span>Career planning</span>
              </div>
            </div>
            <div className="v2-coach-access-actions">
              <span className="pill completed">Active</span>
              <button onClick={() => setTab("coach")}>Open AI Coach</button>
            </div>
          </div>
          <div className="card v2-my-coaches-card">
            <div className="v2-about-section-header">
              <div>
                <h3>
                  <Users size={19} /> Coaching activity
                </h3>
                <p>Your locally saved preparation sessions and evidence.</p>
              </div>
              <strong>{state.coachingSessions.length}</strong>
            </div>
            {state.coachingSessions.length ? (
              <div className="v2-coaching-activity-list">
                {state.coachingSessions.slice(0, 4).map((session) => (
                  <button key={session.id} onClick={() => setTab("coach")}>
                    <span className="v2-coach-avatar-small">
                      <MessageSquare size={15} />
                    </span>
                    <span>
                      <b>
                        {state.jobs.find((job) => job.id === session.jobId)
                          ?.title || "Career coaching session"}
                      </b>
                      <small>
                        {session.questions?.length || 0} questions · Updated{" "}
                        {new Date(
                          session.updatedAt || session.createdAt,
                        ).toLocaleDateString()}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="v2-coaching-empty">
                <MessageSquare size={25} />
                <h4>No coaching sessions yet</h4>
                <p>
                  Open AI Coach to prepare for a role or practice an answer.
                </p>
                <button onClick={() => setTab("coach")}>Start coaching</button>
              </div>
            )}
            <div className="v2-coach-local-notice">
              <ShieldCheck size={17} />
              <span>
                <b>Only you can access this workspace</b>
                <small>
                  Unlike hosted coach portals, this open-source edition never
                  uploads or exposes your job-search data.
                </small>
              </span>
            </div>
          </div>
        </div>
      )}
      {activeTab === "about" && (
        <div className="v2-about-hub" role="tabpanel">
          <div className="card v2-about-hero">
            <div>
              <span className="eyebrow">ABOUT ME HUB</span>
              <h3>Teach JobHuntr how to speak on your behalf</h3>
              <p>
                Everything you add here feeds automated question answering.
                Long-form context supplies story-driven responses while FAQ
                answers handle common interview and application prompts.
              </p>
            </div>
          </div>
          <div className="card v2-about-panel">
            <div className="v2-about-section-header">
              <div>
                <h3>Additional information about me</h3>
                <p>
                  Keep one rich story you’re proud of—JobHuntr reuses this
                  whenever lengthy answers pop up mid-application.
                </p>
              </div>
              <FileText size={20} />
            </div>
            <label>
              Long-form career context
              <textarea
                value={form.additionalInfo}
                onChange={(event) =>
                  setForm({ ...form, additionalInfo: event.target.value })
                }
                placeholder="Example: I’m a systems thinker with 5+ years leading go-to-market experiments…"
              />
            </label>
            <div className="v2-about-stats">
              <span>
                {form.additionalInfo.trim().split(/\s+/).filter(Boolean).length}{" "}
                words
              </span>
              <span>Stored only on this device</span>
            </div>
            <button onClick={save}>
              <Save size={16} /> Save About Me
            </button>
          </div>
          <div className="card v2-faq-panel">
            <div className="v2-about-section-header">
              <div>
                <h3>FAQ Questions</h3>
                <p>Answer common application questions.</p>
              </div>
              {!form.faqAnswers.length ? (
                <button onClick={generateFaq}>
                  <Plus size={15} /> Generate FAQ
                </button>
              ) : (
                <div className="v2-faq-header-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setForm({ ...form, faqAnswers: p.faqAnswers || [] });
                      setSaved(false);
                    }}
                  >
                    <RefreshCcw size={14} /> Refresh
                  </button>
                  <button
                    className={faqDeleteMode ? "danger" : "secondary"}
                    aria-pressed={faqDeleteMode}
                    onClick={() => setFaqDeleteMode(!faqDeleteMode)}
                  >
                    <Trash2 size={14} /> {faqDeleteMode ? "Done" : "Delete"}
                  </button>
                </div>
              )}
            </div>
            {form.faqAnswers.length ? (
              <div className="v2-faq-list">
                {form.faqAnswers.map((faq, index) => (
                  <div
                    className="v2-faq-question"
                    key={faq.id || `${faq.question}-${index}`}
                  >
                    <label>
                      <span>{faq.question}</span>
                      <textarea
                        aria-label={faq.question}
                        rows={2}
                        value={faq.answer}
                        placeholder="Enter your answer…"
                        onChange={(event) => {
                          const faqAnswers = [...form.faqAnswers];
                          faqAnswers[index] = {
                            ...faq,
                            answer: event.target.value,
                          };
                          setForm({ ...form, faqAnswers });
                        }}
                      />
                    </label>
                    {faqDeleteMode && (
                      <button
                        className="danger v2-faq-delete-question"
                        aria-label={`Delete ${faq.question}`}
                        onClick={() => setFaqDeleteTarget({ ...faq, index })}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={save}>
                  <Save size={16} /> Save FAQ answers
                </button>
              </div>
            ) : (
              <div className="v2-faq-empty">
                <MessageSquare size={28} />
                <h4>No FAQ Questions Yet</h4>
                <p>Generate a starter set based on common applications.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === "settings" && (
        <div className="v2-settings-grid" role="tabpanel">
          <div className="card v2-settings-card">
            <div className="v2-settings-card-title">
              <span className="v2-settings-icon">
                <User size={18} />
              </span>
              <div>
                <h3>Career preferences</h3>
                <p>Used to personalize job matches and documents.</p>
              </div>
            </div>
            <label>
              Target roles
              <input
                value={form.targetRoles}
                onChange={(event) =>
                  setForm({ ...form, targetRoles: event.target.value })
                }
              />
            </label>
            <label>
              Skills
              <input
                value={form.skills}
                onChange={(event) =>
                  setForm({ ...form, skills: event.target.value })
                }
              />
            </label>
            <label>
              Preferred locations
              <input
                value={form.locations || ""}
                onChange={(e) =>
                  setForm({ ...form, locations: e.target.value })
                }
              />
            </label>
            <label>
              Minimum salary
              <input
                type="number"
                value={form.minSalary || 0}
                onChange={(e) =>
                  setForm({ ...form, minSalary: e.target.value })
                }
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
            <label className="v2-threshold-setting">
              <span>
                ATS template application threshold
                <strong>{form.atsThreshold}%</strong>
              </span>
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={form.atsThreshold}
                onChange={(event) =>
                  setForm({
                    ...form,
                    atsThreshold: Number(event.target.value),
                  })
                }
              />
              <small>
                If your original resume already meets this score, JobHuntr skips
                ATS resume generation. Otherwise, it prepares a tailored
                version. Default: 80%.
              </small>
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
            <button onClick={save}>
              <Save size={16} /> Save settings
            </button>
          </div>
          <div className="card v2-settings-card v2-local-account">
            <div className="v2-settings-card-title">
              <span className="v2-settings-icon">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h3>Local account</h3>
                <p>Your JobHuntr data stays in this desktop app.</p>
              </div>
            </div>
            <dl>
              <div>
                <dt>Workspace</dt>
                <dd>Local</dd>
              </div>
              <div>
                <dt>Cloud sync</dt>
                <dd>Off</dd>
              </div>
              <div>
                <dt>Telemetry</dt>
                <dd>Off</dd>
              </div>
            </dl>
            <p className="hint">
              Backups and data controls are available from Settings & data in
              the sidebar.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
function Privacy({ state }) {
  const [backupFile, setBackupFile] = useState(null);
  const [backupPreview, setBackupPreview] = useState(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreCancelRef = useRef(null);
  const restoreReturnFocusRef = useRef(null);
  const restoringRef = useRef(restoring);
  useEffect(() => {
    restoringRef.current = restoring;
  }, [restoring]);
  const [csvFile, setCsvFile] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!restoreOpen) return undefined;
    restoreReturnFocusRef.current = document.activeElement;
    restoreCancelRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !restoringRef.current)
        setRestoreOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      restoreReturnFocusRef.current?.focus?.();
    };
  }, [restoreOpen]);
  const restore = async () => {
    if (!backupFile) return;
    setRestoring(true);
    await api("/api/import", { method: "POST", body: await backupFile.text() });
    location.reload();
  };
  const inspectBackup = async (file) => {
    setBackupFile(file || null);
    setBackupPreview(null);
    setResult(null);
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.jobs)) throw new Error("Missing jobs collection");
      setBackupPreview({
        jobs: data.jobs.length,
        resumes: data.resumes?.length || 0,
        runs: data.agentRuns?.length || 0,
        letters: data.coverLetters?.length || 0,
      });
    } catch {
      setResult({ error: "This file is not a valid JobHuntr JSON backup." });
    }
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
      <div className="v2-data-health card">
        <div className="v2-data-health-icon">
          <ShieldCheck size={23} />
        </div>
        <div>
          <span className="eyebrow">LOCAL WORKSPACE</span>
          <h3>Your data is private and ready</h3>
          <p>No cloud sync, telemetry, account, or API key is required.</p>
        </div>
        <dl>
          <div>
            <dt>Tracked jobs</dt>
            <dd>{state.jobs.length}</dd>
          </div>
          <div>
            <dt>Documents</dt>
            <dd>{state.resumes.length + state.coverLetters.length}</dd>
          </div>
          <div>
            <dt>Agent runs</dt>
            <dd>{state.agentRuns.length}</dd>
          </div>
        </dl>
      </div>
      <div className="grid v2-data-grid">
        <div className="card v2-data-card">
          <h3>
            <ShieldCheck /> Local-first guarantees
          </h3>
          <p>
            All personal data persists to <code>./data/jobhuntr.json</code>.
            There is no hosted database, telemetry, auth vendor, or required API
            key.
          </p>
          <ul className="v2-data-checks">
            <li>
              <CheckCircle2 size={15} /> Stored on this device
            </li>
            <li>
              <CheckCircle2 size={15} /> Zero third-party tracking
            </li>
            <li>
              <CheckCircle2 size={15} /> Portable open JSON
            </li>
          </ul>
        </div>
        <div className="card v2-data-card">
          <h3>
            <Download /> Backup
          </h3>
          <p>Exports can contain private resume and note data.</p>
          <div className="v2-data-actions">
            <a className="button" href="/api/export">
              <Download size={15} /> Download JSON
            </a>
            <a className="button secondary" href="/api/export/jobs.csv">
              Download jobs CSV
            </a>
          </div>
        </div>
        <div className="card v2-data-card">
          <h3>
            <Upload /> Restore workspace
          </h3>
          <p>Review a backup before replacing your current workspace.</p>
          <label className="v2-file-drop">
            <Upload size={20} />
            <span>
              <strong>{backupFile?.name || "Choose JSON backup"}</strong>
              <small>JobHuntr export · up to 5,000 jobs</small>
            </span>
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Import JobHuntr JSON backup"
              onChange={(e) => inspectBackup(e.target.files?.[0])}
            />
          </label>
          {backupPreview && (
            <div className="v2-backup-preview" role="status">
              Contains {backupPreview.jobs} jobs, {backupPreview.resumes}{" "}
              resumes, {backupPreview.letters} letters, and {backupPreview.runs}{" "}
              runs.
            </div>
          )}
          <button
            disabled={!backupPreview}
            onClick={() => setRestoreOpen(true)}
          >
            Review restore
          </button>
        </div>
        <div className="card v2-data-card">
          <h3>Import tracked jobs</h3>
          <p>
            Import a JobHuntr CSV or any CSV containing <code>company</code> and{" "}
            <code>title</code> headers. Matching URLs are skipped.
          </p>
          <label className="v2-file-drop">
            <ListPlus size={20} />
            <span>
              <strong>{csvFile?.name || "Choose jobs CSV"}</strong>
              <small>Requires company and title columns</small>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Import jobs CSV"
              onChange={(e) => {
                setCsvFile(e.target.files?.[0]);
                setResult(null);
              }}
            />
          </label>
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
        <div className="card v2-data-card v2-data-wide">
          <h3>Secret scanning</h3>
          <p>
            <code>npm run secret:scan</code> blocks common private keys, tokens,
            and copied env files in CI.
          </p>
        </div>
      </div>
      {restoreOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setRestoreOpen(false)
          }
        >
          <div
            className="modal-card v2-restore-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-title"
            onKeyDown={containDialogFocus}
          >
            <span className="v2-warning-icon">
              <RefreshCcw size={22} />
            </span>
            <h2 id="restore-title">Replace this workspace?</h2>
            <p>
              This will overwrite current JobHuntr data with{" "}
              <strong>{backupFile.name}</strong>. Download a backup first if you
              may need to undo this.
            </p>
            <div className="v2-backup-preview">
              The backup contains {backupPreview.jobs} jobs and{" "}
              {backupPreview.resumes + backupPreview.letters} documents.
            </div>
            <div className="modal-actions">
              <button
                ref={restoreCancelRef}
                className="secondary"
                disabled={restoring}
                onClick={() => setRestoreOpen(false)}
              >
                Cancel
              </button>
              <button disabled={restoring} onClick={restore}>
                {restoring ? "Restoring…" : "Replace workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
