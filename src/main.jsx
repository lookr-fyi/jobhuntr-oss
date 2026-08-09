import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createLatestRequest } from "./latest-request.mjs";
import {
  Briefcase,
  Bot,
  FileText,
  LayoutDashboard,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Upload,
  Download,
  Check,
  CheckCircle2,
  Settings,
  Save,
  ListChecks,
  MessageSquare,
  BadgeCheck,
  CircleDollarSign,
  Infinity as InfinityIcon,
  List,
  ClipboardList,
  DollarSign,
  MessageCircle,
  Zap,
  Users,
  User,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Medal,
  Play,
  Trophy,
  Trash2,
  Calendar,
  Filter,
  MapPin,
  ExternalLink,
  Copy,
  Code,
  Columns,
  LayoutTemplate,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Eye,
  X,
  createLucideIcon,
} from "lucide-react";
import "./styles.css";
import { parseCsv } from "./csv.js";
import jobHuntrLogo from "./jobhuntr-logo.png";
import diceLogo from "./platform-logos/Dice.png";
import glassdoorLogo from "./platform-logos/Glassdoor.png";
import hiringCafeLogo from "./platform-logos/HiringCafe.png";
import indeedLogo from "./platform-logos/Indeed.png";
import jobrightLogo from "./platform-logos/Jobright.png";
import simplifyLogo from "./platform-logos/Simplify.png";
import startupLogo from "./platform-logos/WorkAtAStartup.png";
import zipRecruiterLogo from "./platform-logos/Ziprecruiter.png";
import companyLogo from "./platform-logos/internet.png";
import linkedInLogo from "./platform-logos/linkedin.png";

// Trello was the tracker glyph in the authoritative v2 sidebar. Newer Lucide
// builds omit that brand glyph, so preserve its original two-column geometry
// locally rather than substituting a visually different icon.
const Trello = createLucideIcon("Trello", [
  ["rect", { width: "7", height: "18", x: "3", y: "3", rx: "1", key: "0" }],
  ["rect", { width: "7", height: "9", x: "14", y: "3", rx: "1", key: "1" }],
]);

const PLATFORM_LOGOS = {
  company: companyLogo,
  dice: diceLogo,
  glassdoor: glassdoorLogo,
  hiringcafe: hiringCafeLogo,
  indeed: indeedLogo,
  jobright: jobrightLogo,
  linkedin: linkedInLogo,
  simplify: simplifyLogo,
  workatastartup: startupLogo,
  ziprecruiter: zipRecruiterLogo,
};

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
    "Apply LinkedIn-style matching to your private local catalog.",
  ],
  ["indeed", "i", "Indeed", "Apply Indeed-style matching locally."],
  [
    "glassdoor",
    "g",
    "Glassdoor",
    "Evaluate local roles using company and salary context.",
  ],
  [
    "hiringcafe",
    "hc",
    "HiringCafe",
    "Model curated career-page matching against local roles.",
  ],
  [
    "jobright",
    "jr",
    "Jobright",
    "Evaluate local roles with transparent profile matching.",
  ],
  [
    "simplify",
    "s",
    "Simplify",
    "Apply Simplify-style criteria to local roles.",
  ],
  [
    "workatastartup",
    "w",
    "Work at a Startup",
    "Prioritize startup and founding-team roles locally.",
  ],
  [
    "ziprecruiter",
    "z",
    "ZipRecruiter",
    "Apply broad-market criteria to your local catalog.",
  ],
  [
    "dice",
    "d",
    "Dice",
    "Prioritize local technology roles by skill and location.",
  ],
  [
    "company",
    "↗",
    "Company Career Page Search",
    "Evaluate imported company-career-page roles locally.",
  ],
];
const HUNT_WORKFLOW_IDS = new Set(HUNT_WORKFLOWS.map(([id]) => id));
const normalizeHuntWorkflows = (value, fallback = ["linkedin", "indeed"]) => {
  const valid = Array.isArray(value)
    ? [...new Set(value.filter((id) => HUNT_WORKFLOW_IDS.has(id)))]
    : [];
  return valid.length ? valid : [...fallback];
};
const normalizeCoachMessages = (value) =>
  Array.isArray(value)
    ? value
        .filter(
          (message) =>
            message &&
            ["user", "assistant"].includes(message.role) &&
            typeof message.content === "string" &&
            message.content.trim(),
        )
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 30000),
        }))
        .slice(0, 200)
    : [];
const normalizeCoachConversations = (value) =>
  Array.isArray(value)
    ? value
        .filter(
          (conversation) =>
            conversation &&
            typeof conversation.id === "string" &&
            conversation.id.trim() &&
            normalizeCoachMessages(conversation.messages).length,
        )
        .map((conversation) => ({
          id: conversation.id.slice(0, 200),
          jobId:
            typeof conversation.jobId === "string"
              ? conversation.jobId.slice(0, 200)
              : "",
          title:
            typeof conversation.title === "string" && conversation.title.trim()
              ? conversation.title.slice(0, 300)
              : "Career coaching session",
          messages: normalizeCoachMessages(conversation.messages),
          updatedAt:
            typeof conversation.updatedAt === "string"
              ? conversation.updatedAt
              : new Date().toISOString(),
        }))
        .slice(0, 100)
    : [];
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
function PlatformMark({ id, fallback }) {
  const logo = PLATFORM_LOGOS[id];
  return (
    <span className={`v2-platform-mark ${id}`} aria-hidden="true">
      {logo ? <img src={logo} alt="" /> : fallback}
    </span>
  );
}
const TRACKER_STAGES = [
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
const DEFAULT_VISIBLE_TRACKER_STAGES = TRACKER_STAGES.slice(0, 6);
const MANUAL_TRACKER_STAGES = new Set([
  "applied",
  "interview",
  "offer",
  "rejected",
  "failed",
  "skipped",
  "removed",
]);
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
const emptyTrackedRole = (status = "interested") => ({
  company: "",
  title: "",
  location: "Remote",
  url: "",
  salary: "",
  description: "",
  tags: "",
  status: TRACKER_STAGES.includes(status) ? status : "interested",
});
const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
};
const writeClipboardText = async (value) => {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(String(value));
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = String(value);
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      return copied;
    } catch {
      return false;
    }
  }
};
const isUsableResumeText = (value) => {
  const text = String(value || "").trim();
  return (
    text.length >= 80 &&
    !text.toLowerCase().startsWith("paste your resume here")
  );
};
const extractResumeFileText = async (file) => {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a resume file smaller than 10 MB.");
  let text = "";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const document = await getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    try {
      if (document.numPages > 50)
        throw new Error("Choose a PDF with 50 pages or fewer.");
      const pages = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
      }
      text = pages.join("\n\n");
    } finally {
      await document.cleanup();
    }
  } else {
    text = await file.text();
    if (file.type === "text/html" || /\.html?$/i.test(file.name))
      text = new DOMParser().parseFromString(text, "text/html").body
        .textContent;
  }
  const normalized = String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length < 40)
    throw new Error(
      "JobHuntr could not extract enough resume text. Try a text-based PDF, HTML, or TXT file.",
    );
  return normalized;
};
const isValidApplicationAnswer = (question) => {
  const answer = String(question?.answer || "").trim();
  if (!answer) return question?.required === false;
  if (["dropdown", "multiple_choice"].includes(question?.questionType))
    return (question.options || []).includes(answer);
  return true;
};
const isApplicationQuestionReady = (question) => {
  const answer = String(question?.answer || "").trim();
  if (question?.required === false && !answer) return true;
  return isValidApplicationAnswer(question) && question?.verified === true;
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
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "recently";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatCalendarDate(value, "recently");
};
const formatCalendarDate = (value, fallback = "Recently") => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : fallback;
};
const formatDateTime = (value, fallback = "Recently") => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : fallback;
};
const COVER_LETTER_PREVIEW_THEMES = {
  blank: {
    name: "Blank Template",
    accent: "#333333",
    surface: "#ffffff",
    font: "Arial, sans-serif",
    edge: "none",
  },
  minimal: {
    name: "Minimal",
    accent: "#333333",
    surface: "#ffffff",
    font: "Arial, sans-serif",
    edge: "1px solid #e5e7eb",
  },
  professional: {
    name: "Professional",
    accent: "#34495e",
    surface: "#ffffff",
    font: "'Times New Roman', serif",
    edge: "6px double #34495e",
  },
  modern: {
    name: "Modern",
    accent: "#667eea",
    surface: "#f8f9fa",
    font: "'Helvetica Neue', Arial, sans-serif",
    edge: "5px solid #667eea",
  },
  creative: {
    name: "Creative",
    accent: "#e74c3c",
    surface: "#fffaf2",
    font: "Georgia, serif",
    edge: "5px solid #f39c12",
  },
  "tech-startup": {
    name: "Tech Startup",
    accent: "#667eea",
    surface: "#f8f9ff",
    font: "-apple-system, BlinkMacSystemFont, sans-serif",
    edge: "5px solid #0066cc",
  },
  finance: {
    name: "Finance",
    accent: "#2c5aa0",
    surface: "#ffffff",
    font: "'Times New Roman', serif",
    edge: "4px solid #2c5aa0",
  },
  healthcare: {
    name: "Healthcare",
    accent: "#27ae60",
    surface: "#f8fff8",
    font: "Arial, sans-serif",
    edge: "5px solid #27ae60",
  },
  marketing: {
    name: "Marketing",
    accent: "#ff6b6b",
    surface: "#fff8f8",
    font: "'Helvetica Neue', Arial, sans-serif",
    edge: "8px solid #ff6b6b",
  },
  education: {
    name: "Education",
    accent: "#1976d2",
    surface: "#f0f8ff",
    font: "Georgia, serif",
    edge: "5px solid #3498db",
  },
  legal: {
    name: "Legal",
    accent: "#8b4513",
    surface: "#fffdf8",
    font: "'Times New Roman', serif",
    edge: "6px double #8b4513",
  },
  engineering: {
    name: "Engineering",
    accent: "#34495e",
    surface: "#f8f9fa",
    font: "Calibri, Arial, sans-serif",
    edge: "5px solid #34495e",
  },
  sales: {
    name: "Sales",
    accent: "#e74c3c",
    surface: "#fff5f5",
    font: "Arial, sans-serif",
    edge: "6px solid #e74c3c",
  },
  nonprofit: {
    name: "Nonprofit",
    accent: "#8e44ad",
    surface: "#f8f5ff",
    font: "Georgia, serif",
    edge: "5px solid #8e44ad",
  },
  consulting: {
    name: "Consulting",
    accent: "#16a085",
    surface: "#f4fcfa",
    font: "'Helvetica Neue', Arial, sans-serif",
    edge: "5px solid #1abc9c",
  },
  startup: {
    name: "Startup",
    accent: "#667eea",
    surface: "#f7f8ff",
    font: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    edge: "5px solid #667eea",
  },
};
const coverLetterPreviewDocument = (content, templateId = "minimal") => {
  const escaped = String(content || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const theme =
    COVER_LETTER_PREVIEW_THEMES[templateId] ||
    COVER_LETTER_PREVIEW_THEMES.minimal;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{min-height:100vh;margin:0;padding:54px;background:${theme.surface};color:#27364a;font:15px/1.7 ${theme.font};border-left:${theme.edge}}
    header{margin-bottom:32px;padding-bottom:13px;border-bottom:2px solid ${theme.accent};color:${theme.accent};font:700 20px/1.2 ${theme.font};letter-spacing:.04em}
    pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
  </style></head><body><header>${theme.name}</header><pre>${escaped}</pre></body></html>`;
};
const resumeEditorPreviewDocument = (content) => {
  const escaped = String(content || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:42px 38px;background:#fff;color:#27364a;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
  </style></head><body><pre>${escaped}</pre></body></html>`;
};

const api = async (path, options = {}) => {
  const { suppressGlobalError = false, ...requestOptions } = options;
  try {
    const res = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(requestOptions.headers || {}),
      },
      ...requestOptions,
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
    if (!suppressGlobalError)
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
      'button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
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

const useDialogFocusManagement = () => {
  useEffect(() => {
    let activeDialog = null;
    let returnFocus = null;
    let pendingFocus = 0;
    const focusableSelector =
      'button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
    const syncDialogFocus = () => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(
        (dialog) => dialog.getAttribute("aria-hidden") !== "true",
      );
      const nextDialog = dialogs.at(-1) || null;
      if (nextDialog === activeDialog) return;
      if (!activeDialog && nextDialog) returnFocus = document.activeElement;
      activeDialog = nextDialog;
      window.cancelAnimationFrame(pendingFocus);
      if (nextDialog) {
        pendingFocus = window.requestAnimationFrame(() => {
          if (
            !nextDialog.isConnected ||
            nextDialog.contains(document.activeElement)
          )
            return;
          const firstControl = [
            ...nextDialog.querySelectorAll(focusableSelector),
          ].find((element) => !element.hidden && element.offsetParent !== null);
          if (firstControl) firstControl.focus();
          else {
            nextDialog.tabIndex = -1;
            nextDialog.focus();
          }
        });
      } else if (returnFocus?.isConnected) {
        returnFocus.focus();
        returnFocus = null;
      }
    };
    const observer = new MutationObserver(syncDialogFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    syncDialogFocus();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(pendingFocus);
    };
  }, []);
};

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error("JobHuntr renderer error", error, details);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="v2-renderer-error" role="main">
        <section role="alert" aria-labelledby="renderer-error-title">
          <span className="v2-renderer-error-icon">
            <ShieldAlert size={26} aria-hidden="true" />
          </span>
          <p className="eyebrow">LOCAL WORKSPACE</p>
          <h1 id="renderer-error-title">JobHuntr hit an unexpected problem</h1>
          <p>
            Your local workspace was not cleared or uploaded. Reload the app to
            recover the current screen.
          </p>
          <div className="inline">
            <button onClick={() => window.location.reload()}>
              <RefreshCcw size={16} aria-hidden="true" /> Reload JobHuntr
            </button>
            <button
              className="secondary"
              onClick={() => {
                window.location.hash = "#/overview";
                window.location.reload();
              }}
            >
              Return to Overview
            </button>
          </div>
          <small>
            If the problem repeats, keep the local JobHuntr data directory so
            its recovery backup remains available.
          </small>
        </section>
      </main>
    );
  }
}
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  confirmDisabled = false,
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
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Keep destructive confirmation open when the shared API surface reports
      // a failure, so the user can retry or cancel without losing context.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return createPortal(
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
          <button
            className="danger"
            disabled={busy || confirmDisabled}
            aria-busy={busy}
            onClick={confirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
                {formatCalendarDate(latest.completedAt || latest.createdAt)}
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
  // The authoritative v2 sidebar keeps guidance compact until the user asks
  // for it, leaving the primary navigation and user controls unobstructed.
  const [expanded, setExpanded] = useState(false);
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
        aria-controls="getting-started-checklist"
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
        <div className="v2-guidance-list" id="getting-started-checklist">
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
  useDialogFocusManagement();
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
  const [mobileNavigation, setMobileNavigation] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const navigationRef = useRef(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const userMenuTriggerRef = useRef(null);
  const userMenuFirstItemRef = useRef(null);
  const [err, setErr] = useState("");
  const stateLoader = useMemo(
    () => createLatestRequest(setState, (error) => setErr(error.message)),
    [],
  );
  const load = useCallback(
    () => stateLoader(() => api("/api/state", { suppressGlobalError: true })),
    [stateLoader],
  );
  useEffect(() => {
    const initialLoad = window.setTimeout(load, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  useEffect(() => {
    if (!state?.infiniteHunt?.enabled) return undefined;
    const refresh = window.setInterval(load, 15_000);
    return () => window.clearInterval(refresh);
  }, [load, state?.infiniteHunt?.enabled]);
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
    requestAnimationFrame(() => userMenuFirstItemRef.current?.focus());
    const close = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setUserMenuOpen(false);
        userMenuTriggerRef.current?.focus();
      } else if (!userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", close);
    };
  }, [userMenuOpen]);
  const handleUserMenuKeyDown = (event) => {
    const items = [
      ...(userMenuRef.current?.querySelectorAll('[role="menuitem"]') || []),
    ];
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown")
      nextIndex = (currentIndex + 1 + items.length) % items.length;
    else if (event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };
  useEffect(() => {
    const mobileNavigation = window.matchMedia("(max-width: 760px)");
    const collapseDesktopNavigation = (event) => {
      setMobileNavigation(event.matches);
      if (event.matches) {
        setSidebarHovered(false);
        setUserMenuOpen(false);
      }
    };
    mobileNavigation.addEventListener("change", collapseDesktopNavigation);
    return () =>
      mobileNavigation.removeEventListener("change", collapseDesktopNavigation);
  }, []);
  useEffect(() => {
    localStorage.setItem("jobhuntr-active-route", tab);
    const nextHash = `#/${tab}`;
    const currentRoute = window.location.hash
      .replace(/^#\/?/, "")
      .split("?")[0];
    if (currentRoute !== tab) window.history.pushState({ tab }, "", nextHash);
    window.scrollTo(0, 0);
    document.querySelector("main")?.scrollTo?.(0, 0);
    if (window.matchMedia("(max-width: 760px)").matches) {
      window.requestAnimationFrame(() => {
        navigationRef.current
          ?.querySelector('button[aria-current="page"]')
          ?.scrollIntoView({ block: "nearest", inline: "center" });
      });
    }
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
    ["queue", ClipboardList, "Submission Queue", "automation"],
    ["board", Briefcase, "Job Board", "automation"],
    ["runs", List, "All Runs", "automation", "Agent Runs"],
    ["resume", Zap, "ATS Resume", "documents", "ATS Templates"],
    ["cover-letter", FileText, "Cover Letter", "documents"],
    ["tracker", Trello, "Job Tracker", "career"],
    ["outreach", Users, "Outreach", "career"],
    ["audit", Search, "LinkedIn Audit", "career"],
    ["gigs", DollarSign, "Gigs", "career"],
    ["coach", MessageCircle, "AI Coach", "career", "AI Career Coach"],
  ];
  if (!state && err)
    return (
      <main className="v2-startup-error" role="main">
        <div role="alert">
          <span className="v2-startup-error-icon">
            <ShieldAlert size={24} />
          </span>
          <p className="eyebrow">LOCAL WORKSPACE</p>
          <h1>JobHuntr couldn&apos;t open your workspace</h1>
          <p>
            Your data has not been cleared or uploaded. Retry the private local
            service before changing any files.
          </p>
          <code>{err}</code>
          <button
            onClick={() => {
              setErr("");
              load();
            }}
          >
            Retry opening JobHuntr
          </button>
          <small>
            If retrying does not work, preserve JobHuntr&apos;s local data
            directory so its automatic recovery backup remains available.
          </small>
        </div>
      </main>
    );
  if (!state)
    return (
      <div className="splash" role="status" aria-live="polite">
        <Sparkles aria-hidden="true" /> Loading local JobHuntr…
      </div>
    );
  const onboardingOpen = state.profile.onboarded === false;
  return (
    <div className={sidebarHovered ? "app sidebar-open" : "app"}>
      {onboardingOpen && <Onboarding profile={state.profile} reload={load} />}
      <aside
        aria-hidden={onboardingOpen ? "true" : undefined}
        inert={onboardingOpen}
        aria-label="JobHuntr navigation"
        className={
          sidebarHovered ? "v2-sidebar expanded" : "v2-sidebar collapsed"
        }
        onMouseEnter={() => {
          if (!window.matchMedia("(max-width: 760px)").matches)
            setSidebarHovered(true);
        }}
        onMouseLeave={() => {
          if (!window.matchMedia("(max-width: 760px)").matches)
            setSidebarHovered(false);
        }}
        onFocusCapture={() => {
          if (!window.matchMedia("(max-width: 760px)").matches)
            setSidebarHovered(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setSidebarHovered(false);
        }}
      >
        <div className="brand">
          <img className="logo-image" src={jobHuntrLogo} alt="JobHuntr" />
          <b>JobHuntr</b>
        </div>
        <nav className="v2-nav" ref={navigationRef}>
          {tabs.map(([name, Icon, label, group, tooltip], index) => (
            <div className="v2-nav-slot" key={name}>
              {index > 0 && tabs[index - 1][3] !== group && (
                <div className="v2-divider" />
              )}
              <button
                title={tooltip || label}
                aria-label={tooltip || label}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "active" : ""}
                onPointerDown={(event) => {
                  if (event.button === 0) setTab(name);
                }}
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
              onKeyDown={handleUserMenuKeyDown}
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
                ref={userMenuFirstItemRef}
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
            ref={userMenuTriggerRef}
            onClick={() => {
              if (window.matchMedia("(max-width: 760px)").matches)
                setTab("settings");
              else setUserMenuOpen((open) => !open);
            }}
            className={tab === "settings" ? "active" : ""}
            title="Profile and settings"
            aria-current={tab === "settings" ? "page" : undefined}
            aria-haspopup={mobileNavigation ? undefined : "menu"}
            aria-expanded={mobileNavigation ? undefined : userMenuOpen}
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
      <main
        aria-hidden={onboardingOpen ? "true" : undefined}
        inert={onboardingOpen}
      >
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
      {!onboardingOpen && tab !== "agent" && (
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
  const savingRef = useRef(false);
  const extractingResumeRef = useRef(false);
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
    resumeText: isUsableResumeText(profile.resumeText)
      ? profile.resumeText
      : "",
    resumeFileName: "",
    resumeError: "",
    extractingResume: false,
  });
  const finish = async (overrides = {}) => {
    if (savingRef.current || extractingResumeRef.current) return;
    savingRef.current = true;
    const values = { ...form, ...overrides };
    setSaving(true);
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          onboarded: true,
          name: values.name || "Local Job Hunter",
          location: values.location,
          headline: `${values.role} seeking high-impact teams`,
          targetRoles: [values.role].filter(Boolean),
          skills: values.skills
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          preferences: {
            ...profile.preferences,
            remote: values.remote,
            locations: values.preferredLocations
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            minSalary: Number(values.minSalary) || 0,
            weeklyApplicationGoal: Math.max(1, Number(values.weeklyGoal) || 5),
          },
          resumeText: values.resumeText || profile.resumeText,
        }),
      });
      await reload();
    } catch {
      // Keep onboarding data and the current step available for retry.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const loadResumeFile = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || extractingResumeRef.current || savingRef.current) return;
    extractingResumeRef.current = true;
    setForm((current) => ({
      ...current,
      resumeFileName: file.name,
      resumeError: "",
      extractingResume: true,
    }));
    try {
      const resumeText = await extractResumeFileText(file);
      setForm((current) => ({
        ...current,
        resumeText,
        resumeError: "",
        extractingResume: false,
      }));
    } catch (error) {
      setForm((current) => ({
        ...current,
        resumeText: "",
        resumeError: error.message,
        extractingResume: false,
      }));
    } finally {
      extractingResumeRef.current = false;
      input.value = "";
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
            role="progressbar"
            aria-label={`Setup step ${Math.max(1, step)} of 4`}
            aria-valuemin="1"
            aria-valuemax="4"
            aria-valuenow={Math.max(1, step)}
          >
            {[1, 2, 3, 4].map((value) => (
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
              <button disabled={saving} onClick={() => setStep(1)}>
                Set up my workspace <ChevronRight size={17} />
              </button>
              <button
                className="text-button"
                disabled={saving}
                aria-busy={saving}
                onClick={() =>
                  finish({
                    name: "Demo Job Hunter",
                    role: "Software Engineer",
                    location: "United States",
                    skills: "TypeScript, React, Python, Product delivery",
                    preferredLocations: "Remote, United States",
                    resumeText:
                      "Demo Job Hunter — Software Engineer. Built accessible React and TypeScript products, improved activation by 32%, automated reliable Python workflows, and collaborated with product and design teams to ship measurable customer outcomes.",
                  })
                }
              >
                Use demo profile
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <span className="eyebrow">STEP 1 OF 4</span>
              <h2 id="onboarding-title">What are you looking for?</h2>
              <p>
                Start with the role and identity JobHuntr should optimize for.
              </p>
              <label>
                Your name
                <input
                  name="onboarding-name"
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </label>
              <label>
                Primary target role
                <input
                  name="onboarding-target-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </label>
              <label>
                Home location
                <input
                  name="onboarding-home-location"
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
              <span className="eyebrow">STEP 2 OF 4</span>
              <h2 id="onboarding-title">Show us your strengths</h2>
              <p>
                Add the skills JobHuntr should prioritize when scoring roles.
              </p>
              <label>
                Skills, comma-separated
                <textarea
                  name="onboarding-skills"
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
              <span className="eyebrow">STEP 3 OF 4</span>
              <h2 id="onboarding-title">Add your resume privately</h2>
              <p>
                JobHuntr uses your real experience for ATS matching. The file is
                processed only on this computer.
              </p>
              <label className="v2-template-dropzone v2-onboarding-resume-dropzone">
                <Upload size={28} />
                <b>{form.resumeFileName || "Choose your resume"}</b>
                <span>PDF, HTML, or TXT · 10 MB maximum</span>
                <input
                  name="onboarding-resume-file"
                  aria-label="Upload resume during setup"
                  type="file"
                  disabled={form.extractingResume || saving}
                  accept=".pdf,.html,.htm,.txt,text/plain,text/html,application/pdf"
                  onChange={loadResumeFile}
                />
              </label>
              {form.extractingResume && (
                <div className="v2-template-upload-progress" role="status">
                  <RefreshCcw size={17} /> Extracting resume text locally…
                </div>
              )}
              {form.resumeError && (
                <div className="v2-submit-safety-note" role="alert">
                  {form.resumeError}
                </div>
              )}
              <label>
                Resume text
                <textarea
                  name="onboarding-resume-text"
                  disabled={form.extractingResume || saving}
                  value={form.resumeText}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      resumeText: event.target.value,
                      resumeError: "",
                    })
                  }
                  placeholder="Or paste your complete resume here…"
                />
              </label>
              <div className="v2-onboarding-actions">
                <button
                  className="secondary"
                  disabled={form.extractingResume}
                  onClick={() => setStep(2)}
                >
                  Back
                </button>
                <button
                  disabled={
                    form.extractingResume ||
                    !isUsableResumeText(form.resumeText)
                  }
                  onClick={() => setStep(4)}
                >
                  Continue <ChevronRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <span className="eyebrow">STEP 4 OF 4</span>
              <h2 id="onboarding-title">Set your search preferences</h2>
              <p>These defaults can be changed anytime in User Center.</p>
              <label>
                Preferred locations
                <input
                  name="onboarding-preferred-locations"
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
                    name="onboarding-minimum-salary"
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
                    name="onboarding-weekly-goal"
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
                  name="onboarding-remote-jobs"
                  type="checkbox"
                  checked={form.remote}
                  onChange={(e) =>
                    setForm({ ...form, remote: e.target.checked })
                  }
                />{" "}
                Include remote jobs
              </label>
              <div className="v2-onboarding-actions">
                <button className="secondary" onClick={() => setStep(3)}>
                  Back
                </button>
                <button
                  disabled={saving}
                  aria-busy={saving}
                  onClick={() => finish()}
                >
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
  const [chartVisibility, setChartVisibility] = useState({
    evaluated: true,
    queued: true,
  });
  const [chartHover, setChartHover] = useState(null);
  const farewellCloseRef = useRef(null);
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
  const latestRun = state.agentRuns[0] || null;
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
  const chartStartCandidate = new Date(
    state.meta?.createdAt ||
      state.jobs
        .map((job) => job.createdAt || job.updatedAt)
        .filter(Boolean)
        .sort()[0] ||
      now,
  );
  const chartStart = Number.isFinite(chartStartCandidate.getTime())
    ? chartStartCandidate
    : new Date(now);
  chartStart.setHours(0, 0, 0, 0);
  const chartDays = Math.max(
    1,
    Math.floor((now.getTime() - chartStart.getTime()) / 86400000) + 1,
  );
  const chartPointCount = Math.min(chartDays, 366);
  const chartData = Array.from({ length: chartPointCount }, (_, index) => {
    const dayOffset =
      chartPointCount === 1
        ? 0
        : Math.round((index / (chartPointCount - 1)) * (chartDays - 1));
    const date = new Date(chartStart);
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() + dayOffset);
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
    try {
      await reload();
      setMotivationIndex((index) => (index + 1) % OVERVIEW_MOTIVATION.length);
    } catch {
      // The shared workspace loader reports the failure without leaving the
      // v2 refresh control stuck or creating an uncaught browser error.
    } finally {
      setRefreshing(false);
    }
  };
  const exitJobHuntr = async () => {
    if (state.infiniteHunt?.enabled)
      await api("/api/infinite-hunt/stop", { method: "POST" }).catch(() => {});
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
            <h1>Welcome back, {firstName}</h1>
            <p>
              Track your pipeline, pick up where you left off, and keep momentum
              without hopping between tabs.
            </p>
          </div>
          <div className="v2-hero-actions">
            <button
              className="secondary"
              disabled={!latestRun}
              onClick={() => {
                if (!latestRun) return;
                window.location.hash = `#/runs?run=${encodeURIComponent(latestRun.id)}`;
              }}
            >
              <Play size={16} /> Open latest run
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
        <b>{OVERVIEW_MOTIVATION[motivationIndex]}</b>
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
              <h2>Pipeline over time</h2>
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
                    name={`overview-chart-${key}`}
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
              <h2>Top Contributors of {monthLabel}</h2>
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
            tabIndex={-1}
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
  const [form, setForm] = useState(() => emptyTrackedRole());
  const [selected, setSelected] = useState(trackerParams.get("job") || null);
  const [query, setQuery] = useState("");
  const [columnPagination, setColumnPagination] = useState({
    query: "",
    counts: {},
  });
  const [visibleStages, setVisibleStages] = useState(() => {
    const linkedStages = trackerParams
      .get("statuses")
      ?.split(",")
      .filter((stage) => TRACKER_STAGES.includes(stage));
    if (linkedStages?.length) return new Set(linkedStages);
    try {
      const stored = localStorage.getItem("jobTracker_visibleStatuses");
      if (stored === null) return new Set(DEFAULT_VISIBLE_TRACKER_STAGES);
      const saved = JSON.parse(stored);
      const validSaved = Array.isArray(saved)
        ? saved.filter((stage) => TRACKER_STAGES.includes(stage))
        : [];
      if (validSaved.length) return new Set(validSaved);
    } catch {
      // Recover malformed or obsolete local display preferences below.
    }
    // A malformed or obsolete preference should remain recoverable rather
    // than leaving a returning user with an apparently empty tracker.
    return new Set(stages);
  });
  const [runFilter, setRunFilter] = useState(() => {
    const requested =
      trackerParams.get("run") ||
      localStorage.getItem("jobTracker_selectedAgentRun") ||
      "all";
    const validRunFilters = new Set([
      "all",
      "manual",
      "automated",
      ...(state.agentRuns || []).map((run) => run.id),
    ]);
    return validRunFilters.has(requested) ? requested : "all";
  });
  const [showForm, setShowForm] = useState(false);
  const [newJobBaseline, setNewJobBaseline] = useState("");
  const [discardNewJobOpen, setDiscardNewJobOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editFormBaseline, setEditFormBaseline] = useState("");
  const [discardTrackerEdit, setDiscardTrackerEdit] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const editBusyRef = useRef(false);
  const addBusyRef = useRef(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState("");
  const [draggingJobId, setDraggingJobId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [movingJobIds, setMovingJobIds] = useState(() => new Set());
  const movingJobIdsRef = useRef(new Set());
  const [copiedTrackerUrl, setCopiedTrackerUrl] = useState("");
  const [pendingAppliedJobId, setPendingAppliedJobId] = useState("");
  const funnelCloseRef = useRef(null);
  const jobDrawerCloseRef = useRef(null);
  const addJobDrawerCloseRef = useRef(null);
  const job = state.jobs.find((item) => item.id === selected);
  const deleteTarget = state.jobs.find((item) => item.id === deleteJobId);
  const trackerEditDigest = (value) => (value ? JSON.stringify(value) : "");
  const hasUnsavedNewJob = Boolean(
    showForm && newJobBaseline && trackerEditDigest(form) !== newJobBaseline,
  );
  const finishClosingNewJob = useCallback(() => {
    setShowForm(false);
    setNewJobBaseline("");
    setDiscardNewJobOpen(false);
    setForm((current) => emptyTrackedRole(current.status));
  }, [setForm]);
  const requestCloseNewJob = useCallback(() => {
    if (addBusyRef.current || discardNewJobOpen) return;
    if (hasUnsavedNewJob) {
      setDiscardNewJobOpen(true);
      return;
    }
    finishClosingNewJob();
  }, [discardNewJobOpen, finishClosingNewJob, hasUnsavedNewJob]);
  const requestCloseNewJobRef = useRef(requestCloseNewJob);
  useEffect(() => {
    requestCloseNewJobRef.current = requestCloseNewJob;
  }, [requestCloseNewJob]);
  const hasUnsavedTrackerEdit = Boolean(
    editForm &&
    editFormBaseline &&
    trackerEditDigest(editForm) !== editFormBaseline,
  );
  const finishClosingTrackerEdit = useCallback((closeDrawer = false) => {
    setEditForm(null);
    setEditFormBaseline("");
    setDiscardTrackerEdit("");
    if (closeDrawer) setSelected(null);
  }, []);
  const requestCancelTrackerEdit = useCallback(() => {
    if (editBusyRef.current || discardTrackerEdit) return;
    if (hasUnsavedTrackerEdit) {
      setDiscardTrackerEdit("edit");
      return;
    }
    finishClosingTrackerEdit(false);
  }, [discardTrackerEdit, finishClosingTrackerEdit, hasUnsavedTrackerEdit]);
  const requestCloseJobDrawer = useCallback(() => {
    if (editBusyRef.current || discardTrackerEdit) return;
    if (hasUnsavedTrackerEdit) {
      setDiscardTrackerEdit("drawer");
      return;
    }
    finishClosingTrackerEdit(true);
  }, [discardTrackerEdit, finishClosingTrackerEdit, hasUnsavedTrackerEdit]);
  const requestCloseJobDrawerRef = useRef(requestCloseJobDrawer);
  useEffect(() => {
    requestCloseJobDrawerRef.current = requestCloseJobDrawer;
  }, [requestCloseJobDrawer]);
  const jobDrawerOpen = Boolean(job);
  const jobSubmission = state.submissions
    .filter((item) => item.jobId === selected)
    .sort((a, b) => {
      if (a.status === "submitted" && b.status !== "submitted") return -1;
      if (b.status === "submitted" && a.status !== "submitted") return 1;
      return (
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
      );
    })[0];
  const runFiltered = state.jobs.filter((item) => {
    const matchesRun =
      runFilter === "all" ||
      (runFilter === "manual" && !item.workflowRunId) ||
      (runFilter === "automated" && Boolean(item.workflowRunId)) ||
      item.workflowRunId === runFilter;
    return matchesRun;
  });
  const filtered = runFiltered.filter((item) => {
    const haystack =
      `${item.company} ${item.title} ${item.location} ${(item.tags || []).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
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
  useEffect(() => {
    const followTrackerLink = () => {
      if (!window.location.hash.startsWith("#/tracker")) return;
      const params = new URLSearchParams(
        window.location.hash.split("?")[1] || "",
      );
      const linkedJob = params.get("job");
      if (linkedJob && state.jobs.some((item) => item.id === linkedJob))
        setSelected(linkedJob);
      const linkedStages = params
        .get("statuses")
        ?.split(",")
        .filter((stage) => TRACKER_STAGES.includes(stage));
      if (linkedStages?.length) setVisibleStages(new Set(linkedStages));
      const linkedRun = params.get("run");
      if (linkedRun) setRunFilter(linkedRun);
    };
    window.addEventListener("hashchange", followTrackerLink);
    window.addEventListener("popstate", followTrackerLink);
    return () => {
      window.removeEventListener("hashchange", followTrackerLink);
      window.removeEventListener("popstate", followTrackerLink);
    };
  }, [state.jobs]);
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
      jobs: runFiltered,
    },
    {
      id: "applied",
      label: "Applied",
      color: "#1d4ed8",
      jobs: runFiltered.filter((item) => appliedStatuses.has(item.status)),
    },
    {
      id: "interview",
      label: "Interviewing",
      color: "#b45309",
      jobs: runFiltered.filter((item) =>
        ["interview", "offer"].includes(item.status),
      ),
    },
    {
      id: "offer",
      label: "Offers",
      color: "#047857",
      jobs: runFiltered.filter((item) => item.status === "offer"),
    },
    {
      id: "rejected",
      label: "Rejected",
      color: "#b91c1c",
      jobs: runFiltered.filter((item) => item.status === "rejected"),
    },
  ];
  const interviewRoundStages = [
    ...new Set(
      runFiltered.flatMap((item) =>
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
      jobs: runFiltered.filter((item) => {
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
  useEffect(() => {
    if (!jobDrawerOpen) return undefined;
    const returnFocus = document.activeElement;
    jobDrawerCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") requestCloseJobDrawerRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [jobDrawerOpen]);
  useEffect(() => {
    if (!showForm) return undefined;
    const returnFocus = document.activeElement;
    addJobDrawerCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") requestCloseNewJobRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [showForm]);
  const patch = async (id, body) => {
    try {
      await api(`/api/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reload();
      return true;
    } catch {
      return false;
    }
  };
  const requestStatusChange = async (id, status) => {
    const target = state.jobs.find((item) => item.id === id);
    if (!target || target.status === status || movingJobIdsRef.current.has(id))
      return false;
    if (status === "applied" && target?.status !== "applied") {
      setPendingAppliedJobId(id);
      return false;
    }
    movingJobIdsRef.current.add(id);
    setMovingJobIds(new Set(movingJobIdsRef.current));
    try {
      return await patch(id, { status });
    } finally {
      movingJobIdsRef.current.delete(id);
      setMovingJobIds(new Set(movingJobIdsRef.current));
    }
  };
  const confirmAppliedStatus = async (id) => {
    if (movingJobIdsRef.current.has(id)) return false;
    movingJobIdsRef.current.add(id);
    setMovingJobIds(new Set(movingJobIdsRef.current));
    try {
      return await patch(id, {
        status: "applied",
        confirmedByUser: true,
      });
    } finally {
      movingJobIdsRef.current.delete(id);
      setMovingJobIds(new Set(movingJobIdsRef.current));
    }
  };
  const selectJob = (id) => {
    setSelected(id);
    setEditForm(null);
    setEditFormBaseline("");
    setDiscardTrackerEdit("");
  };
  const openNewJob = (status) => {
    const next = emptyTrackedRole(status);
    setForm(next);
    setNewJobBaseline(trackerEditDigest(next));
    setDiscardNewJobOpen(false);
    setShowForm(true);
  };
  const openTrackerEdit = (target) => {
    const next = {
      company: target.company || "",
      title: target.title || "",
      location: target.location || "",
      salary: target.salary || "",
      url: target.url || "",
      description: target.description || "",
      status: target.status,
      tags: (target.tags || []).join(", "),
    };
    setEditForm(next);
    setEditFormBaseline(trackerEditDigest(next));
    setDiscardTrackerEdit("");
  };
  const getTrackerUrl = (jobId = "") => {
    const params = new URLSearchParams();
    if (jobId) params.set("job", jobId);
    if (runFilter !== "all") params.set("run", runFilter);
    if (visibleStages.size)
      params.set("statuses", [...visibleStages].join(","));
    return `${window.location.origin}${window.location.pathname}#/tracker${params.size ? `?${params}` : ""}`;
  };
  const copyTrackerUrl = async (url, feedback) => {
    if (!(await writeClipboardText(url))) return;
    setCopiedTrackerUrl(feedback);
    window.setTimeout(
      () =>
        setCopiedTrackerUrl((current) => (current === feedback ? "" : current)),
      1800,
    );
  };
  const exportTrackerCsv = () => {
    if (!runFiltered.length) return;
    const escapeCsv = (value) => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const headers = [
      "Company",
      "Job Title",
      "Location",
      "Status",
      "Application URL",
      "Application Date",
      "Contact Person",
      "ATS Score",
      "Optimized ATS Score",
      "Post Time",
      "Number of Applicants",
      "Status Insight",
      "Workflow Run ID",
      "Created At",
      "Updated At",
    ];
    const rows = runFiltered.map((item) => [
      item.company,
      item.title,
      item.location,
      trackerStageLabel(item.status),
      item.url,
      item.applicationDatetime
        ? formatDateTime(item.applicationDatetime, "")
        : "",
      item.hiringContactName || item.contacts?.[0]?.name || "",
      item.fitScore ?? "",
      item.optimizedAtsScore ?? "",
      item.postedAt || "",
      item.numApplicants ?? "",
      item.statusInsight || "",
      item.workflowRunId || "",
      item.createdAt ? formatDateTime(item.createdAt, "") : "",
      item.updatedAt ? formatDateTime(item.updatedAt, "") : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `job-tracker-export-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const saveEdit = async () => {
    if (
      !job ||
      !editForm?.company.trim() ||
      !editForm?.title.trim() ||
      editBusyRef.current
    )
      return;
    editBusyRef.current = true;
    setEditBusy(true);
    try {
      const requestedStatus = editForm.status;
      const saved = await patch(job.id, {
        ...editForm,
        status: job.status,
        tags: String(editForm.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      if (!saved) return;
      setEditForm(null);
      setEditFormBaseline("");
      if (requestedStatus !== job.status)
        await requestStatusChange(job.id, requestedStatus);
    } finally {
      editBusyRef.current = false;
      setEditBusy(false);
    }
  };
  const save = async () => {
    if (!form.company.trim() || !form.title.trim() || addBusyRef.current)
      return;
    addBusyRef.current = true;
    setAddBusy(true);
    try {
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
      setForm(emptyTrackedRole());
      setSelected(created.id);
      setShowForm(false);
      setNewJobBaseline("");
      setDiscardNewJobOpen(false);
      await reload();
    } catch {
      // Keep the completed role in the drawer so creation can be retried.
    } finally {
      addBusyRef.current = false;
      setAddBusy(false);
    }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/api/jobs/${deleteTarget.id}`, { method: "DELETE" });
      if (selected === deleteTarget.id) {
        setSelected(null);
        setEditForm(null);
        setEditFormBaseline("");
        setDiscardTrackerEdit("");
      }
      setDeleteJobId("");
      await reload();
    } catch (error) {
      throw error;
    }
  };
  return (
    <section className="tracker-page">
      <ConfirmDialog
        open={discardNewJobOpen}
        title="Discard new job?"
        description="This tracked role has not been saved. Discard the information you entered?"
        confirmLabel="Discard Job"
        busyLabel="Discarding…"
        onClose={() => setDiscardNewJobOpen(false)}
        onConfirm={finishClosingNewJob}
      />
      <ConfirmDialog
        open={Boolean(discardTrackerEdit)}
        title="Discard job changes?"
        description="Your latest edits to this tracked role have not been saved. Discard them?"
        confirmLabel="Discard Changes"
        busyLabel="Discarding…"
        onClose={() => setDiscardTrackerEdit("")}
        onConfirm={() =>
          finishClosingTrackerEdit(discardTrackerEdit === "drawer")
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete tracked job?"
        description={
          deleteTarget
            ? `${deleteTarget.title} at ${deleteTarget.company} and its related notes, tasks, and drafts${state.submissions.some((submission) => submission.jobId === deleteTarget.id && submission.status === "submitted") ? ", submitted application record, and locked document snapshots" : ""} will be permanently removed.`
            : "This tracked job will be permanently removed."
        }
        onClose={() => {
          setDeleteOpen(false);
          setDeleteJobId("");
        }}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={Boolean(pendingAppliedJobId)}
        title="Confirm external submission"
        description="Only mark this job applied after you personally verified the employer's confirmation page or email. Do not confirm a draft, validation error, CAPTCHA, or incomplete upload."
        confirmLabel="I verified it was submitted"
        busyLabel="Recording…"
        onClose={() => setPendingAppliedJobId("")}
        onConfirm={async () => {
          const id = pendingAppliedJobId;
          const saved = await confirmAppliedStatus(id);
          if (!saved) throw new Error("Could not record external submission");
        }}
      />
      <div className="v2-tracker-header">
        <h1>Job Tracker</h1>
        <div>
          <span>{runFiltered.length} applications</span>
          {runFilter !== "all" && <span>• Filtered by agent run</span>}
          <button className="funnel-button" onClick={() => setFunnelOpen(true)}>
            Funnel Analysis
          </button>
          <button
            className="export-button"
            title="Export applications to CSV"
            disabled={!runFiltered.length}
            onClick={exportTrackerCsv}
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>
      <span className="v2-tracker-copy-status" role="status" aria-live="polite">
        {copiedTrackerUrl}
      </span>
      <div className="tracker-filter-panel v2-tracker-filters-always job-tracker-filters">
        <div className="filter-group">
          <input
            name="tracker-search"
            className="search-input"
            aria-label="Search tracked jobs"
            value={query}
            onChange={(e) => {
              const nextQuery = e.target.value;
              setQuery(nextQuery);
              setColumnPagination({
                query: nextQuery.trim().toLowerCase(),
                counts: {},
              });
            }}
            placeholder="Search jobs..."
          />
        </div>
        <div className="filter-group status-filter-group">
          <span className="tracker-filter-label filter-label">
            Show Columns:
          </span>
          <div className="tracker-status-filters status-filter-grid">
            {stages.map((stage) => (
              <label className="status-filter-item" key={stage}>
                <input
                  name={`tracker-status-${stage}`}
                  className="status-filter-checkbox"
                  type="checkbox"
                  checked={visibleStages.has(stage)}
                  onChange={() => toggleStage(stage)}
                />
                <span
                  className={`status-filter-label ${stage} ${visibleStages.has(stage) ? "visible" : "hidden"}`}
                >
                  {trackerStageLabel(stage)}
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="filter-group run-filter-group">
          <span className="tracker-filter-label filter-label">Run:</span>
          <select
            name="tracker-agent-run-filter"
            className="workflow-run-select"
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
                {formatCalendarDate(run.createdAt)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tracker-workspace">
        <div className="kanban">
          {stages
            .filter((stage) => visibleStages.has(stage))
            .map((stage) => {
              const stageJobs = filtered.filter(
                (item) => item.status === stage,
              );
              const normalizedQuery = query.trim().toLowerCase();
              const visibleCount =
                columnPagination.query === normalizedQuery
                  ? columnPagination.counts[stage] || 20
                  : 20;
              const visibleJobs = stageJobs.slice(0, visibleCount);
              const remainingCount = stageJobs.length - visibleJobs.length;
              return (
                <div
                  className={`kanban-column status-column ${dragOverStage === stage ? "drag-over" : ""}`}
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverStage !== stage) setDragOverStage(stage);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setDragOverStage("");
                  }}
                  onDrop={(e) => {
                    setDragOverStage("");
                    requestStatusChange(e.dataTransfer.getData("jobId"), stage);
                  }}
                >
                  <div className="column-title status-column-header">
                    <b className="status-title">{trackerStageLabel(stage)}</b>
                    <span className="status-count">{stageJobs.length}</span>
                  </div>
                  <div
                    className={`status-column-content ${dragOverStage === stage ? "drag-over" : ""}`}
                  >
                    <div className="jobs-list">
                      {stageJobs.length === 0 && (
                        <div className="empty-column">
                          <p>
                            {query.trim() ? "No matches" : "No applications"}
                          </p>
                          {MANUAL_TRACKER_STAGES.has(stage) && (
                            <button
                              className="v2-tracker-add-job"
                              onClick={() => openNewJob(stage)}
                            >
                              <Plus size={14} /> Add Job
                            </button>
                          )}
                        </div>
                      )}
                      {visibleJobs.map((item) => {
                        const appliedAt = (item.statusHistory || []).findLast(
                          (event) => event.status === "applied",
                        )?.at;
                        const packet = state.submissions
                          .filter((submission) => submission.jobId === item.id)
                          .sort(
                            (a, b) =>
                              new Date(b.updatedAt || b.createdAt || 0) -
                              new Date(a.updatedAt || a.createdAt || 0),
                          )[0];
                        const shortDate = (value) => {
                          if (!value) return "";
                          const date = new Date(value);
                          return Number.isFinite(date.getTime())
                            ? date.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "";
                        };
                        return (
                          <article className="job-card" key={item.id}>
                            <button
                              draggable={!movingJobIds.has(item.id)}
                              disabled={movingJobIds.has(item.id)}
                              aria-busy={movingJobIds.has(item.id)}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("jobId", item.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingJobId(item.id);
                              }}
                              onDragEnd={() => {
                                setDraggingJobId("");
                                setDragOverStage("");
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                copyTrackerUrl(
                                  getTrackerUrl(item.id),
                                  `Link copied for ${item.title}`,
                                );
                              }}
                              onClick={() => selectJob(item.id)}
                              className={`kanban-card ${item.id === selected ? "selected" : ""}`}
                            >
                              <span className="job-card-header">
                                <b className="job-title">{item.title}</b>
                                {!item.workflowRunId && (
                                  <span className="manual-badge">Manual</span>
                                )}
                              </span>
                              <span className="job-card-body">
                                <span className="company-name">
                                  {item.company}
                                </span>
                                <small className="location">
                                  {item.location || "Location not set"}
                                </small>
                                {appliedAt && (
                                  <small className="application-date">
                                    Applied: {shortDate(appliedAt)}
                                  </small>
                                )}
                                {item.workflowRunId && (
                                  <small className="ats-score">
                                    ATS Score:{" "}
                                    {packet?.atsScore ?? item.fitScore}%
                                  </small>
                                )}
                                {item.workflowRunId &&
                                  item.numApplicants > 0 && (
                                    <small className="applicants-count">
                                      {item.numApplicants} applicants
                                    </small>
                                  )}
                                {item.tasks?.some((task) => !task.done) && (
                                  <em>
                                    {
                                      item.tasks.filter((task) => !task.done)
                                        .length
                                    }{" "}
                                    open task(s)
                                  </em>
                                )}
                              </span>
                            </button>
                            <div className="job-card-footer">
                              <small className="post-date">
                                {item.postedAt || item.collectedAt
                                  ? `Posted: ${shortDate(item.postedAt || item.collectedAt)}`
                                  : ""}
                              </small>
                              {safeHttpUrl(item.url) && (
                                <a
                                  className="view-link"
                                  href={safeHttpUrl(item.url)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View Job
                                </a>
                              )}
                            </div>
                            {item.status === "interested" &&
                              item.workflowRunId && (
                                <div className="job-card-primary-action">
                                  <button
                                    onClick={() => {
                                      const queueHash = packet
                                        ? `#/queue?packet=${encodeURIComponent(packet.id)}`
                                        : "#/queue";
                                      window.history.pushState(
                                        {
                                          tab: "queue",
                                          packet: packet?.id || null,
                                        },
                                        "",
                                        queueHash,
                                      );
                                      setTab("queue");
                                    }}
                                  >
                                    Go to Submission Queue
                                  </button>
                                </div>
                              )}
                          </article>
                        );
                      })}
                      {remainingCount > 0 && (
                        <button
                          className="load-more-button"
                          onClick={() =>
                            setColumnPagination((current) => ({
                              query: normalizedQuery,
                              counts: {
                                ...(current.query === normalizedQuery
                                  ? current.counts
                                  : {}),
                                [stage]: visibleCount + 20,
                              },
                            }))
                          }
                        >
                          Load more ({remainingCount})
                        </button>
                      )}
                      {stageJobs.length > 0 &&
                        MANUAL_TRACKER_STAGES.has(stage) && (
                          <button
                            className="v2-tracker-add-job"
                            onClick={() => openNewJob(stage)}
                          >
                            <Plus size={14} /> Add Job
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        {job && (
          <>
            <button
              className="job-drawer-backdrop"
              tabIndex={-1}
              aria-label="Dismiss job details"
              onClick={requestCloseJobDrawer}
            />
            <div
              className="job-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={`${job.title} at ${job.company} details`}
              onKeyDown={containDialogFocus}
            >
              <div className="job-drawer-header">
                <h2>{editForm ? "Edit Job" : "Job Details"}</h2>
                <div className="job-drawer-header-buttons">
                  {editForm ? (
                    <>
                      <button
                        className="save-button"
                        disabled={
                          editBusy ||
                          !editForm.title.trim() ||
                          !editForm.company.trim()
                        }
                        aria-busy={editBusy}
                        onClick={saveEdit}
                      >
                        {editBusy ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="secondary cancel-button"
                        disabled={editBusy}
                        onClick={requestCancelTrackerEdit}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {!job.workflowRunId && (
                        <button
                          className="secondary small edit-button"
                          aria-label="Edit job"
                          onClick={() => openTrackerEdit(job)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        ref={jobDrawerCloseRef}
                        className="drawer-close close-button"
                        aria-label="Close job details"
                        onClick={requestCloseJobDrawer}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="job-drawer-content">
                {editForm ? (
                  <div className="job-edit-form info-section">
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
                            name={`edit-job-${field}`}
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
                        name="edit-job-status"
                        aria-label="Edit job status"
                        value={editForm.status}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            status: event.target.value,
                          })
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
                        name="edit-job-description"
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <section className="info-section position-section">
                      <h3 className="section-title">Position</h3>
                      <h2 className="job-title-large">{job.title}</h2>
                      <div className="company-info-large">
                        <strong className="company-name">{job.company}</strong>
                        <span className="location">
                          {job.location || "Location not available"}
                        </span>
                        {job.salary && (
                          <span className="salary">{job.salary}</span>
                        )}
                      </div>
                      {safeHttpUrl(job.url) && (
                        <a
                          className="job-listing-link"
                          href={safeHttpUrl(job.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open job listing ↗
                        </a>
                      )}
                    </section>
                    <section className="info-section status-section">
                      <h3 className="section-title">Status</h3>
                      <select
                        name="job-status"
                        className="status-select"
                        aria-label="Job status"
                        disabled={movingJobIds.has(job.id)}
                        aria-busy={movingJobIds.has(job.id)}
                        value={job.status}
                        onChange={(e) =>
                          requestStatusChange(job.id, e.target.value)
                        }
                      >
                        {stages.map((s) => (
                          <option value={s} key={s}>
                            {trackerStageLabel(s)}
                          </option>
                        ))}
                      </select>
                    </section>
                    <section className="info-section timeline-section">
                      <h3 className="section-title">Timeline</h3>
                      <div className="date-info">
                        <div className="date-item">
                          <span className="date-label">Posted:</span>
                          <span className="date-value">
                            {job.postedAt || job.collectedAt
                              ? formatCalendarDate(
                                  job.postedAt || job.collectedAt,
                                  "Not available",
                                )
                              : "Not available"}
                          </span>
                        </div>
                        <div className="date-item">
                          <span className="date-label">Last Updated:</span>
                          <span className="date-value">
                            {job.updatedAt
                              ? formatDateTime(job.updatedAt, "Not available")
                              : "Not available"}
                          </span>
                        </div>
                        {job.statusHistory?.some(
                          (event) => event.status === "applied",
                        ) && (
                          <div className="date-item">
                            <span className="date-label">Applied:</span>
                            <span className="date-value">
                              {formatDateTime(
                                [...job.statusHistory]
                                  .reverse()
                                  .find((event) => event.status === "applied")
                                  .at,
                                "Not available",
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </section>
                    <section className="info-section description-section">
                      <h3 className="section-title">Description</h3>
                      <p>{job.description || "No description saved."}</p>
                      <div className="chips">
                        {(job.tags || []).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </section>
                    <TrackerApplicationInsights
                      job={job}
                      submission={jobSubmission}
                      profile={state.profile}
                    />
                    {jobSubmission &&
                      !["submitted", "archived"].includes(
                        jobSubmission.status,
                      ) && (
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
                    {["interview", "offer", "rejected"].includes(
                      job.status,
                    ) && <InterviewRounds job={job} reload={reload} />}
                    <Actions key={job.id} job={job} reload={reload} />
                  </>
                )}
                {!editForm && (
                  <>
                    <section className="info-section status-history-section">
                      <h3 className="section-title">Status History</h3>
                      <div className="status-history">
                        {(job.statusHistory || []).map((event, index) => (
                          <p key={`${event.at}-${index}`}>
                            <b>{trackerStageLabel(event.status)}</b>
                            <small>{formatDateTime(event.at)}</small>
                          </p>
                        ))}
                      </div>
                    </section>
                    <div className="job-drawer-actions">
                      <button
                        className="danger"
                        onClick={() => {
                          setDeleteJobId(job.id);
                          setDeleteOpen(true);
                        }}
                      >
                        Delete role
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {showForm && (
        <>
          <button
            className="job-drawer-backdrop"
            tabIndex={-1}
            aria-label="Dismiss new job"
            onClick={requestCloseNewJob}
          />
          <div
            className="job-drawer add-job-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-job-drawer-title"
            onKeyDown={containDialogFocus}
          >
            <div className="job-drawer-header">
              <h2 id="add-job-drawer-title">Add New Job</h2>
              <div className="job-drawer-header-buttons">
                <button
                  disabled={
                    addBusy || !form.company.trim() || !form.title.trim()
                  }
                  aria-busy={addBusy}
                  onClick={save}
                >
                  {addBusy ? "Saving…" : "Save"}
                </button>
                <button
                  ref={addJobDrawerCloseRef}
                  className="secondary cancel-button"
                  disabled={addBusy}
                  onClick={requestCloseNewJob}
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="job-drawer-content">
              <div className="job-edit-form info-section">
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
                        name={`new-job-${field}`}
                        required={["title", "company"].includes(field)}
                        value={form[field]}
                        onChange={(event) =>
                          setForm({ ...form, [field]: event.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Status
                  <select
                    name="new-job-status"
                    aria-label="New job status"
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value })
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
                    name="new-job-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        </>
      )}
      {draggingJobId && (
        <div
          className="global-delete-zone"
          role="button"
          tabIndex={-1}
          aria-label="Drop to delete job"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const droppedJobId =
              event.dataTransfer.getData("jobId") || draggingJobId;
            setDraggingJobId("");
            if (!state.jobs.some((item) => item.id === droppedJobId)) return;
            setDeleteJobId(droppedJobId);
            setDeleteOpen(true);
          }}
        >
          <span className="delete-zone-content">
            <Trash2 className="delete-icon" size={32} />
            <span className="delete-text">Drop to Delete</span>
          </span>
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
            tabIndex={-1}
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
                  (stage.jobs.length / Math.max(runFiltered.length, 1)) * 100,
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
                      {index > 0 && runFiltered.length
                        ? `${Math.round((stage.jobs.length / runFiltered.length) * 100)}%`
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
                            width: `${Math.max(8, (stage.jobs.length / Math.max(runFiltered.length, 1)) * 100)}%`,
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
                  {runFiltered.length
                    ? Math.round(
                        (funnelStages[1].jobs.length / runFiltered.length) *
                          100,
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
      {submission?.status === "submitted" && (
        <section
          className="v2-tracker-info-section v2-submission-evidence"
          aria-label="Submitted application evidence"
        >
          <div className="v2-tracker-info-head">
            <h3>
              <ShieldCheck size={16} /> Submitted application
            </h3>
            <span className="v2-evidence-locked">Locked</span>
          </div>
          <p>
            {submission.submittedAt
              ? `Verified externally on ${formatDateTime(submission.submittedAt)}. `
              : "Recorded as externally submitted. "}
            This snapshot cannot be changed by later profile or document edits.
          </p>
          <dl>
            <div>
              <dt>Job</dt>
              <dd>
                {submission.jobSnapshot?.title || job.title} ·{" "}
                {submission.jobSnapshot?.company || job.company}
              </dd>
            </div>
            <div>
              <dt>Resume</dt>
              <dd>
                {submission.resumeSnapshot?.name || "Captured at submission"}
                {submission.resumeSnapshot && (
                  <a
                    href={`/print/submission/${submission.id}/resume`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View captured resume
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt>Cover letter</dt>
              <dd>
                {submission.coverLetterSnapshot?.title || "Not attached"}
                {submission.coverLetterSnapshot && (
                  <a
                    href={`/print/submission/${submission.id}/cover-letter`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View captured letter
                  </a>
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}
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
  const draftKey = `jobhuntr-interview-round-draft:${job.id}`;
  const [initialDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (!saved || saved.jobId !== job.id) return null;
      return {
        editingId: typeof saved.editingId === "string" ? saved.editingId : null,
        number: String(saved.number || "").slice(0, 3),
        notes: String(saved.notes || "").slice(0, 10_000),
      };
    } catch {
      localStorage.removeItem(draftKey);
      return null;
    }
  });
  const [editingId, setEditingId] = useState(initialDraft?.editingId || null);
  const [showForm, setShowForm] = useState(Boolean(initialDraft));
  const [number, setNumber] = useState(initialDraft?.number || "");
  const [notes, setNotes] = useState(initialDraft?.notes || "");
  const [draftRestored, setDraftRestored] = useState(Boolean(initialDraft));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [deleteId, setDeleteId] = useState(null);
  const rounds = job.interviewRounds || [];
  const reset = () => {
    localStorage.removeItem(draftKey);
    setEditingId(null);
    setShowForm(false);
    setNumber("");
    setNotes("");
    setDraftRestored(false);
  };
  useEffect(() => {
    if (!showForm) return;
    localStorage.setItem(
      draftKey,
      JSON.stringify({ jobId: job.id, editingId, number, notes }),
    );
  }, [draftKey, editingId, job.id, notes, number, showForm]);
  const persist = async (next) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ interviewRounds: next }),
      });
      await reload();
      reset();
      return true;
    } catch {
      // The shared API error surface keeps the editor open for retry.
      return false;
    } finally {
      busyRef.current = false;
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
          const removed = await persist(
            rounds.filter((round) => round.id !== deleteId),
          );
          if (!removed) throw new Error("Could not delete interview round");
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
          {draftRestored && (
            <p className="v2-draft-restored" role="status">
              Unsaved interview round draft restored.
            </p>
          )}
          <label>
            Round number
            <input
              name="interview-round-number"
              type="number"
              min="1"
              value={number}
              onChange={(event) => {
                setNumber(event.target.value);
                setDraftRestored(false);
              }}
              placeholder="e.g., 1, 2, 3"
            />
          </label>
          <label>
            Notes
            <textarea
              name="interview-round-notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setDraftRestored(false);
              }}
              placeholder="Add details about this interview round…"
            />
          </label>
          <div className="inline">
            <button
              disabled={busy || !number.trim() || !notes.trim()}
              aria-busy={busy}
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
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => edit(round)}
                >
                  Edit
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
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
  const defaultTask = "Follow up with recruiter";
  const defaultContact = {
    name: "",
    role: "Recruiter",
    email: "",
    linkedIn: "",
  };
  const actionDraftKey = `jobhuntr-tracker-action-draft:${job.id}`;
  const [initialActionDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(actionDraftKey) || "null");
      if (!saved || saved.jobId !== job.id) return null;
      return {
        note: String(saved.note || "").slice(0, 10_000),
        task: String(saved.task || defaultTask).slice(0, 500),
        taskDue: String(saved.taskDue || "").slice(0, 10),
        editingTaskId: String(saved.editingTaskId || "").slice(0, 100),
        contact: {
          name: String(saved.contact?.name || "").slice(0, 200),
          role: String(saved.contact?.role || "Recruiter").slice(0, 200),
          email: String(saved.contact?.email || "").slice(0, 320),
          linkedIn: String(saved.contact?.linkedIn || "").slice(0, 2_000),
        },
        editingContactId: String(saved.editingContactId || "").slice(0, 100),
      };
    } catch {
      localStorage.removeItem(actionDraftKey);
      return null;
    }
  });
  const [note, setNote] = useState(initialActionDraft?.note || "");
  const [task, setTask] = useState(initialActionDraft?.task || defaultTask);
  const [taskDue, setTaskDue] = useState(initialActionDraft?.taskDue || "");
  const [editingTaskId, setEditingTaskId] = useState(
    initialActionDraft?.editingTaskId || "",
  );
  const [editingContactId, setEditingContactId] = useState(
    initialActionDraft?.editingContactId || "",
  );
  const [actionDraftRestored, setActionDraftRestored] = useState(
    Boolean(initialActionDraft),
  );
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [savingNote, setSavingNote] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const savingNoteRef = useRef(false);
  const savingTaskRef = useRef(false);
  const savingContactRef = useRef(false);
  const [pendingTaskIds, setPendingTaskIds] = useState(new Set());
  const pendingTaskIdsRef = useRef(new Set());
  const [contact, setContact] = useState(
    initialActionDraft?.contact || defaultContact,
  );
  useEffect(() => {
    const hasDraft = Boolean(
      note.trim() ||
      (task.trim() && task !== defaultTask) ||
      taskDue ||
      editingTaskId ||
      contact.name.trim() ||
      contact.role !== defaultContact.role ||
      contact.email.trim() ||
      contact.linkedIn.trim() ||
      editingContactId,
    );
    if (!hasDraft) {
      localStorage.removeItem(actionDraftKey);
      return;
    }
    localStorage.setItem(
      actionDraftKey,
      JSON.stringify({
        jobId: job.id,
        note,
        task,
        taskDue,
        editingTaskId,
        contact,
        editingContactId,
      }),
    );
  }, [
    actionDraftKey,
    contact,
    defaultContact.role,
    defaultTask,
    editingContactId,
    editingTaskId,
    job.id,
    note,
    task,
    taskDue,
  ]);
  const resetContact = () => {
    setContact({
      name: "",
      role: "Recruiter",
      email: "",
      linkedIn: "",
    });
    setEditingContactId("");
  };
  const resetTask = () => {
    setTask("");
    setTaskDue("");
    setEditingTaskId("");
  };
  const saveNote = async () => {
    if (!note.trim() || savingNoteRef.current) return;
    savingNoteRef.current = true;
    setSavingNote(true);
    try {
      await api(`/api/jobs/${job.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ text: note }),
      });
      setNote("");
      await reload();
    } catch {
      // Preserve the note so saving can be retried.
    } finally {
      savingNoteRef.current = false;
      setSavingNote(false);
    }
  };
  const saveTask = async () => {
    if (!task.trim() || savingTaskRef.current) return;
    savingTaskRef.current = true;
    setSavingTask(true);
    try {
      await api(
        `/api/jobs/${job.id}/tasks${editingTaskId ? `/${editingTaskId}` : ""}`,
        {
          method: editingTaskId ? "PATCH" : "POST",
          body: JSON.stringify({ text: task, due: taskDue }),
        },
      );
      resetTask();
      await reload();
    } catch {
      // Preserve the task fields so saving can be retried.
    } finally {
      savingTaskRef.current = false;
      setSavingTask(false);
    }
  };
  const saveContact = async () => {
    if (!contact.name.trim() || savingContactRef.current) return;
    savingContactRef.current = true;
    setSavingContact(true);
    try {
      await api(
        `/api/jobs/${job.id}/contacts${editingContactId ? `/${editingContactId}` : ""}`,
        {
          method: editingContactId ? "PATCH" : "POST",
          body: JSON.stringify(contact),
        },
      );
      resetContact();
      await reload();
    } catch {
      // Preserve the contact fields so saving can be retried.
    } finally {
      savingContactRef.current = false;
      setSavingContact(false);
    }
  };
  const toggleTask = async (taskId, done) => {
    if (pendingTaskIdsRef.current.has(taskId)) return;
    pendingTaskIdsRef.current.add(taskId);
    setPendingTaskIds(new Set(pendingTaskIdsRef.current));
    try {
      await api(`/api/jobs/${job.id}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ done }),
      });
      await reload();
    } catch {
      // Keep the existing completion state visible so toggling can be retried.
    } finally {
      pendingTaskIdsRef.current.delete(taskId);
      setPendingTaskIds(new Set(pendingTaskIdsRef.current));
    }
  };
  return (
    <div className="job-actions">
      {actionDraftRestored && (
        <p className="v2-draft-restored" role="status">
          Unsaved note, task, or contact draft restored.
        </p>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.type || "item"}?`}
        description={`“${deleteTarget?.label || "This item"}” will be permanently removed from this tracked job.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await api(
            `/api/jobs/${job.id}/${deleteTarget.type}s/${deleteTarget.id}`,
            { method: "DELETE" },
          );
          setDeleteTarget(null);
          await reload();
        }}
      />
      <h3>Notes</h3>
      <div className="inline">
        <input
          name="private-job-note"
          aria-label="Private job note"
          disabled={savingNote}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setActionDraftRestored(false);
          }}
          placeholder="Add a private note"
        />
        <button
          disabled={savingNote || !note.trim()}
          aria-busy={savingNote}
          onClick={saveNote}
        >
          {savingNote ? "Saving…" : "Save"}
        </button>
      </div>
      {(job.notes || []).map((n) => (
        <div className="note v2-record-row" key={n.id}>
          <span>
            {n.text}
            <small>{formatDateTime(n.at)}</small>
          </span>
          <button
            className="icon danger"
            aria-label={`Delete note ${n.text}`}
            onClick={() =>
              setDeleteTarget({ type: "note", id: n.id, label: n.text })
            }
          >
            ×
          </button>
        </div>
      ))}
      <h3>Tasks</h3>
      <div className="task-compose">
        <input
          name="job-task-description"
          aria-label="Task description"
          disabled={savingTask}
          value={task}
          onChange={(e) => {
            setTask(e.target.value);
            setActionDraftRestored(false);
          }}
        />
        <input
          name="job-task-due-date"
          type="date"
          aria-label="Task due date"
          disabled={savingTask}
          value={taskDue}
          onChange={(e) => {
            setTaskDue(e.target.value);
            setActionDraftRestored(false);
          }}
        />
        <button
          disabled={savingTask || !task.trim()}
          aria-busy={savingTask}
          onClick={saveTask}
        >
          {savingTask ? "Saving…" : editingTaskId ? "Save task" : "Add"}
        </button>
        {editingTaskId && (
          <button
            className="secondary"
            disabled={savingTask}
            onClick={() => resetTask()}
          >
            Cancel task edit
          </button>
        )}
      </div>
      {(job.tasks || []).map((t) => (
        <div className="task-row" key={t.id}>
          <label className="check">
            <input
              type="checkbox"
              name={`task-${t.id}`}
              checked={t.done}
              disabled={pendingTaskIds.has(t.id)}
              aria-busy={pendingTaskIds.has(t.id)}
              onChange={(e) => toggleTask(t.id, e.target.checked)}
            />
            <span>
              {t.text}
              {t.due && (
                <small>
                  Due {formatCalendarDate(`${t.due}T12:00:00`, "Not set")}
                </small>
              )}
            </span>
          </label>
          <span className="inline">
            <button
              className="text-button"
              disabled={savingTask}
              onClick={() => {
                setTask(t.text);
                setTaskDue(t.due || "");
                setEditingTaskId(t.id);
              }}
            >
              Edit
            </button>
            <button
              className="icon danger"
              disabled={savingTask}
              aria-label={`Delete task ${t.text}`}
              onClick={() =>
                setDeleteTarget({ type: "task", id: t.id, label: t.text })
              }
            >
              ×
            </button>
          </span>
        </div>
      ))}
      <h3>Contacts</h3>
      <div className="contact-form">
        <label>
          Name
          <input
            name="job-contact-name"
            disabled={savingContact}
            placeholder="Alex Morgan"
            value={contact.name}
            onChange={(e) => {
              setContact({ ...contact, name: e.target.value });
              setActionDraftRestored(false);
            }}
          />
        </label>
        <label>
          Role
          <input
            name="job-contact-role"
            disabled={savingContact}
            placeholder="Recruiter"
            value={contact.role}
            onChange={(e) => {
              setContact({ ...contact, role: e.target.value });
              setActionDraftRestored(false);
            }}
          />
        </label>
        <label>
          Email
          <input
            name="job-contact-email"
            type="email"
            disabled={savingContact}
            placeholder="alex@company.com"
            value={contact.email}
            onChange={(e) => {
              setContact({ ...contact, email: e.target.value });
              setActionDraftRestored(false);
            }}
          />
        </label>
        <label>
          LinkedIn profile
          <input
            name="job-contact-linkedin"
            type="url"
            disabled={savingContact}
            placeholder="https://www.linkedin.com/in/alex"
            value={contact.linkedIn}
            onChange={(e) => {
              setContact({ ...contact, linkedIn: e.target.value });
              setActionDraftRestored(false);
            }}
          />
        </label>
      </div>
      <button
        disabled={savingContact || !contact.name.trim()}
        aria-busy={savingContact}
        onClick={saveContact}
      >
        {savingContact
          ? "Saving…"
          : editingContactId
            ? "Save contact"
            : "Add contact"}
      </button>
      {editingContactId && (
        <button
          className="secondary"
          disabled={savingContact}
          onClick={resetContact}
        >
          Cancel contact edit
        </button>
      )}
      {(job.contacts || []).map((c) => (
        <article className="contact v2-record-row" key={c.id}>
          <span>
            <b>{c.name}</b> · {c.role}
            {c.email && <small>{c.email}</small>}
            {safeHttpUrl(c.linkedIn) && (
              <a
                href={safeHttpUrl(c.linkedIn)}
                target="_blank"
                rel="noreferrer"
              >
                View LinkedIn profile
              </a>
            )}
          </span>
          <span className="inline">
            <button
              className="text-button"
              disabled={savingContact}
              onClick={() => {
                setContact({
                  name: c.name || "",
                  role: c.role || "",
                  email: c.email || "",
                  linkedIn: c.linkedIn || "",
                });
                setEditingContactId(c.id);
              }}
            >
              Edit
            </button>
            <button
              className="icon danger"
              disabled={savingContact}
              aria-label={`Delete contact ${c.name}`}
              onClick={() =>
                setDeleteTarget({
                  type: "contact",
                  id: c.id,
                  label: c.name,
                })
              }
            >
              ×
            </button>
          </span>
        </article>
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
  const [searching, setSearching] = useState(false);
  const queueingRef = useRef("");
  const searchingRef = useRef(false);
  const boardSearchRequestId = useRef(0);
  const [notice, setNotice] = useState("");
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const leaderboardCloseRef = useRef(null);
  const search = async () => {
    if (searchingRef.current) return;
    searchingRef.current = true;
    const requestId = ++boardSearchRequestId.current;
    setSearching(true);
    try {
      const jobs = await api("/api/board/search", {
        method: "POST",
        body: JSON.stringify({ q: "", location: "" }),
      });
      if (boardSearchRequestId.current === requestId) {
        setResults(jobs);
        setSelectedUrl("");
      }
    } catch {
      // Keep the current feed visible so refreshing can be retried.
    } finally {
      searchingRef.current = false;
      setSearching(false);
    }
  };
  useEffect(() => {
    const requestId = ++boardSearchRequestId.current;
    api("/api/board/search", {
      method: "POST",
      body: JSON.stringify({ q: "" }),
    })
      .then((jobs) => {
        if (boardSearchRequestId.current === requestId) setResults(jobs);
      })
      .catch(() => {});
  }, []);
  const submittedJobIds = new Set(
    state.submissions.map((submission) => submission.jobId),
  );
  const queuedUrls = new Set([
    ...state.jobs
      .filter((job) => submittedJobIds.has(job.id))
      .map((job) => job.url)
      .filter(Boolean),
    ...newlyQueuedUrls,
  ]);
  const visibleResults = useMemo(
    () =>
      results
        .filter((job) => {
          const normalizedQuery = q.trim().toLowerCase();
          const normalizedLocation = location.trim().toLowerCase();
          const searchableText =
            `${job.company || ""} ${job.title || ""} ${job.location || ""}`.toLowerCase();
          return (
            (!normalizedQuery || searchableText.includes(normalizedQuery)) &&
            (!normalizedLocation ||
              String(job.location || "")
                .toLowerCase()
                .includes(normalizedLocation)) &&
            job.fitScore >= minimumFit &&
            maximumListedSalary(job) >= minimumSalary &&
            (remoteType === "all" ||
              (remoteType === "remote"
                ? /remote|anywhere/i.test(job.location)
                : !/remote|anywhere/i.test(job.location))) &&
            (jobType === "all" || boardJobType(job) === jobType) &&
            (seniority === "all" || boardSeniority(job) === seniority) &&
            (sponsorship === "all" || boardSponsorship(job) === sponsorship) &&
            (source === "all" || job.source === source)
          );
        })
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
      q,
      location,
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
    if (!job?.url || queueingRef.current || queuedUrls.has(job.url)) return;
    queueingRef.current = job.url;
    setQueueing(job.url);
    setNotice("");
    try {
      await api("/api/board/queue", {
        method: "POST",
        body: JSON.stringify({ ...job, status: "interested" }),
      });
      setNewlyQueuedUrls((current) => new Set(current).add(job.url));
      setNotice(`${job.title} was added to your submission queue.`);
      await reload();
    } catch {
      // The shared API error surface preserves the unqueued card for retry.
    } finally {
      queueingRef.current = "";
      setQueueing("");
    }
  };
  const clearFilters = async () => {
    if (searchingRef.current) return;
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
    await search();
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
            <button
              className="secondary"
              disabled={searching}
              aria-busy={searching}
              onClick={search}
            >
              <RefreshCcw size={15} />{" "}
              {searching ? "Refreshing…" : "Refresh now"}
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
            name="board-search"
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
              name="board-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Remote, city, or state"
            />
          </label>
          <label>
            Minimum match
            <select
              name="board-minimum-match"
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
              name="board-minimum-salary"
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
              name="board-work-arrangement"
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
              name="board-source"
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
              name="board-job-type"
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
              name="board-seniority"
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
              name="board-sponsorship"
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
              name="board-sort"
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
          <button
            className="secondary"
            type="button"
            disabled={searching}
            onClick={search}
          >
            {searching ? "Applying…" : "Apply filters"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={searching || !activeFilterCount}
            onClick={clearFilters}
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
        <strong>
          {visibleResults.length}{" "}
          {visibleResults.length === 1 ? "opportunity" : "opportunities"}
        </strong>
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
                    {formatCalendarDate(
                      selected.postedAt || selected.collectedAt,
                    )}
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
                aria-busy={queueing === selected.url}
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
            tabIndex={-1}
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
const isSubmissionEligibleJob = (job) =>
  ["interested", "submitting", "failed", "skipped"].includes(job?.status);
function Queue({ state, reload, setTab }) {
  const queueParams = new URLSearchParams(
    window.location.hash.split("?")[1] || "",
  );
  const [jobId, setJobId] = useState(
    state.jobs.find(isSubmissionEligibleJob)?.id || "",
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
  const [creatingPacketFor, setCreatingPacketFor] = useState("");
  const creatingPacketRef = useRef(false);
  const submittingReadyRef = useRef(false);
  const submitCloseRef = useRef(null);
  const active = state.submissions.filter((item) => {
    const job = state.jobs.find((candidate) => candidate.id === item.jobId);
    return (
      !["archived", "submitted"].includes(item.status) &&
      isSubmissionEligibleJob(job)
    );
  });
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
  const queueableJobs = state.jobs.filter(
    (job) => !queuedJobIds.has(job.id) && isSubmissionEligibleJob(job),
  );
  const selectedQueueJobId = queueableJobs.some((job) => job.id === jobId)
    ? jobId
    : queueableJobs[0]?.id || "";
  const sourceJobs = state.jobs.filter((job) => {
    if (queuedJobIds.has(job.id) || !isSubmissionEligibleJob(job)) return false;
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
    if (!selectedQueueJobId || creatingPacketRef.current) return;
    creatingPacketRef.current = true;
    setCreatingPacketFor(selectedQueueJobId);
    try {
      const created = await api("/api/submissions", {
        method: "POST",
        body: JSON.stringify({
          jobId: selectedQueueJobId,
          resumeId: recommendedResume(selectedQueueJobId),
          coverLetterId:
            state.coverLetters.find((x) => x.jobId === selectedQueueJobId)
              ?.id || "",
        }),
      });
      setSelectedId(created.id);
      await reload();
    } catch {
      // Keep the selected role available so packet creation can be retried.
    } finally {
      creatingPacketRef.current = false;
      setCreatingPacketFor("");
    }
  };
  const prepareJob = async (targetJobId) => {
    if (!targetJobId || creatingPacketRef.current) return;
    creatingPacketRef.current = true;
    setCreatingPacketFor(targetJobId);
    try {
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
    } catch {
      // Leave the source job selected so preparation can be retried.
    } finally {
      creatingPacketRef.current = false;
      setCreatingPacketFor("");
    }
  };
  const resetSubmitAssist = useCallback(() => {
    setSubmitOpen(false);
    setSubmitBatch([]);
    setSubmitIndex(0);
    setSubmissionConfirmed(false);
  }, []);
  const requestCloseSubmitAssist = useCallback(() => {
    if (submittingReadyRef.current) return;
    resetSubmitAssist();
  }, [resetSubmitAssist]);
  useEffect(() => {
    if (!submitOpen) return undefined;
    const returnFocus = document.activeElement;
    submitCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") requestCloseSubmitAssist();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [requestCloseSubmitAssist, submitOpen]);
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
  const queueTabs = ["apply", "search", "manual"];
  const handleQueueTabKeyDown = (event, value) => {
    const currentIndex = queueTabs.indexOf(value);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % queueTabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + queueTabs.length) % queueTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = queueTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = queueTabs[nextIndex];
    setQueueTab(nextTab);
    document.getElementById(`queue-tab-${nextTab}`)?.focus();
  };
  const recordCurrentSubmission = async () => {
    if (
      !currentSubmitPacket ||
      !submissionConfirmed ||
      submittingReadyRef.current
    )
      return;
    submittingReadyRef.current = true;
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
        resetSubmitAssist();
        setSelectedId("");
      }
    } catch {
      // Keep the reviewed packet open when recording fails.
    } finally {
      submittingReadyRef.current = false;
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
        busyLabel="Archiving…"
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          await api("/api/submissions/archive", {
            method: "POST",
            body: JSON.stringify({ ids: filtered.map((item) => item.id) }),
          });
          setSelectedId("");
          await reload();
        }}
      />
      <div className="v2-queue-title-row">
        <div>
          <h2>Submission Queue</h2>
          <p>Review and submit jobs collected by your agents</p>
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
        <div>
          <p>
            Complete each packet checklist first. This local edition records
            your confirmation but never submits to an external website. New
            verified answers can be saved in your About Me profile.
          </p>
          <button
            className="text-button"
            onClick={() => {
              sessionStorage.setItem("jobhuntr-user-tab", "about-me");
              setTab("settings");
            }}
          >
            About Me
          </button>
        </div>
      </div>
      <div className="v2-queue-tabs">
        <div
          className="v2-queue-tab-buttons"
          role="tablist"
          aria-label="Submission sources"
        >
          <button
            id="queue-tab-apply"
            role="tab"
            aria-selected={queueTab === "apply"}
            aria-controls="queue-panel-apply"
            tabIndex={queueTab === "apply" ? 0 : -1}
            className={queueTab === "apply" ? "active" : ""}
            onClick={() => setQueueTab("apply")}
            onKeyDown={(event) => handleQueueTabKeyDown(event, "apply")}
          >
            <ClipboardListIcon /> From Apply Runs <em>{active.length}</em>
          </button>
          <button
            id="queue-tab-search"
            role="tab"
            aria-selected={queueTab === "search"}
            aria-controls="queue-panel-search"
            tabIndex={queueTab === "search" ? 0 : -1}
            className={queueTab === "search" ? "active" : ""}
            onClick={() => setQueueTab("search")}
            onKeyDown={(event) => handleQueueTabKeyDown(event, "search")}
          >
            <Search size={15} /> From Search Runs{" "}
            <em>
              {
                state.jobs.filter(
                  (job) =>
                    !queuedJobIds.has(job.id) &&
                    isSubmissionEligibleJob(job) &&
                    !["manual", "import", "csv import"].includes(
                      String(job.source || "").toLowerCase(),
                    ),
                ).length
              }
            </em>
          </button>
          <button
            id="queue-tab-manual"
            role="tab"
            aria-selected={queueTab === "manual"}
            aria-controls="queue-panel-manual"
            tabIndex={queueTab === "manual" ? 0 : -1}
            className={queueTab === "manual" ? "active" : ""}
            onClick={() => setQueueTab("manual")}
            onKeyDown={(event) => handleQueueTabKeyDown(event, "manual")}
          >
            <Briefcase size={15} /> From Job Board{" "}
            <em>
              {
                state.jobs.filter(
                  (job) =>
                    !queuedJobIds.has(job.id) &&
                    isSubmissionEligibleJob(job) &&
                    ["manual", "import", "csv import"].includes(
                      String(job.source || "").toLowerCase(),
                    ),
                ).length
              }
            </em>
          </button>
        </div>
        <div className="v2-queue-tab-tools">
          <Search size={16} />
          <input
            name={`queue-${queueTab}-search`}
            aria-label={
              queueTab === "apply"
                ? "Search submission queue"
                : `Search ${queueTab} jobs`
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by company or title"
          />
          {queueTab === "apply" && (
            <>
              <button
                className={filtersOpen ? "active-filter" : ""}
                aria-label="Filters"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((current) => !current)}
              >
                <Filter size={16} />
              </button>
              <button
                className="danger"
                aria-label="Archive filtered"
                title="Archive filtered"
                disabled={!filtered.length}
                onClick={() => setArchiveOpen(true)}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      {queueTab !== "apply" ? (
        <div
          id={`queue-panel-${queueTab}`}
          className="v2-queue-layout"
          role="tabpanel"
          aria-labelledby={`queue-tab-${queueTab}`}
        >
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
                <button
                  disabled={Boolean(creatingPacketFor)}
                  aria-busy={creatingPacketFor === sourceSelected.id}
                  onClick={() => prepareJob(sourceSelected.id)}
                >
                  <FileText size={16} />{" "}
                  {creatingPacketFor === sourceSelected.id
                    ? "Preparing…"
                    : "Prepare application"}
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
      ) : (
        <div
          id="queue-panel-apply"
          className="v2-queue-panel"
          role="tabpanel"
          aria-labelledby="queue-tab-apply"
        >
          <div className="v2-queue-toolbar">
            <div className="v2-create-packet">
              <select
                name="submission-queue-job"
                aria-label="Tracked role"
                value={selectedQueueJobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                {!queueableJobs.length && (
                  <option value="">No unqueued roles available</option>
                )}
                {queueableJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.company} — {j.title}
                  </option>
                ))}
              </select>
              <button
                disabled={!selectedQueueJobId || Boolean(creatingPacketFor)}
                aria-busy={creatingPacketFor === selectedQueueJobId}
                onClick={create}
              >
                <Plus size={15} />{" "}
                {creatingPacketFor === selectedQueueJobId
                  ? "Adding…"
                  : "Add to queue"}
              </button>
            </div>
          </div>
          {filtersOpen && (
            <div className="v2-queue-filter-panel">
              <label>
                Minimum profile match
                <select
                  name="queue-minimum-match"
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
                  name="queue-minimum-ats"
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
                  name="queue-has-ats-resume"
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
                  name="queue-sort"
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
                  name="queue-location"
                  aria-label="Queue location"
                  value={queueLocation}
                  onChange={(event) => setQueueLocation(event.target.value)}
                  placeholder="Remote, city, or state"
                />
              </label>
              <label>
                Minimum salary
                <select
                  name="queue-minimum-salary"
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
                  name="queue-work-arrangement"
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
                  name="queue-job-type"
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
                  name="queue-seniority"
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
                  name="queue-sponsorship"
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
                  key={selected.id}
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
        </div>
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
            tabIndex={-1}
            aria-label="Close start submitting dialog"
            disabled={submittingReady}
            onClick={requestCloseSubmitAssist}
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
                name="batch-submission-confirmed"
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
                disabled={submittingReady}
                onClick={requestCloseSubmitAssist}
              >
                Cancel
              </button>
              <button
                disabled={submittingReady || !submissionConfirmed}
                aria-busy={submittingReady}
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
function QuestionVerification({ question, onChange }) {
  const skipped =
    question.required === false && !String(question.answer || "").trim();
  if (skipped)
    return (
      <div className="check v2-question-verification v2-question-skipped">
        <span>
          <strong>Optional question skipped</strong>
          <small>No response will be recorded for this field.</small>
        </span>
      </div>
    );
  const valid = isValidApplicationAnswer(question);
  return (
    <label className="check v2-question-verification">
      <input
        type="checkbox"
        name={`verify-question-${question.id}`}
        aria-label={`Verification checkbox ${question.id}`}
        checked={Boolean(question.verified)}
        disabled={!valid}
        onChange={(event) => onChange(question.id, event.target.checked)}
      />
      <span>
        <strong>I verified this exact answer</strong>
        <small>
          I compared this exact answer with the employer&apos;s current form.
        </small>
      </span>
    </label>
  );
}
function SubmissionCard({ submission: s, state, reload }) {
  const packetUpdateQueue = useRef(Promise.resolve());
  const recordingSubmissionRef = useRef(false);
  const [externalSubmissionVerified, setExternalSubmissionVerified] =
    useState(false);
  const [recordingSubmission, setRecordingSubmission] = useState(false);
  const answerDraftKey = `jobhuntr-application-answer-draft:${s.id}`;
  const [initialAnswerDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(answerDraftKey) || "null");
      if (
        !saved ||
        saved.packetId !== s.id ||
        typeof saved.answers !== "object"
      )
        return {};
      const validIds = new Set(
        (s.applicationQuestions || [])
          .filter(
            (question) =>
              !["dropdown", "multiple_choice"].includes(question.questionType),
          )
          .map((question) => question.id),
      );
      return Object.fromEntries(
        Object.entries(saved.answers)
          .filter(([id]) => validIds.has(id))
          .slice(0, 100)
          .map(([id, answer]) => [id, String(answer || "").slice(0, 10_000)]),
      );
    } catch {
      localStorage.removeItem(answerDraftKey);
      return {};
    }
  });
  const [draftAnswers, setDraftAnswers] = useState(() =>
    Object.fromEntries(
      (s.applicationQuestions || [])
        .filter(
          (question) =>
            !["dropdown", "multiple_choice"].includes(question.questionType),
        )
        .map((question) => [
          question.id,
          initialAnswerDraft[question.id] ?? question.answer ?? "",
        ]),
    ),
  );
  const [dirtyAnswerIds, setDirtyAnswerIds] = useState(
    () => new Set(Object.keys(initialAnswerDraft)),
  );
  const [answerDraftRestored, setAnswerDraftRestored] = useState(
    Boolean(Object.keys(initialAnswerDraft).length),
  );
  useEffect(() => {
    if (!dirtyAnswerIds.size) {
      localStorage.removeItem(answerDraftKey);
      return;
    }
    localStorage.setItem(
      answerDraftKey,
      JSON.stringify({
        packetId: s.id,
        answers: Object.fromEntries(
          [...dirtyAnswerIds].map((id) => [id, draftAnswers[id] || ""]),
        ),
      }),
    );
  }, [answerDraftKey, dirtyAnswerIds, draftAnswers, s.id]);
  const job = state.jobs.find((j) => j.id === s.jobId);
  const attachedResume = state.resumes.find((item) => item.id === s.resumeId);
  const attachedLetter = state.coverLetters.find(
    (item) => item.id === s.coverLetterId,
  );
  const profileResumeReady = isUsableResumeText(state.profile.resumeText);
  const selectedResumeReady =
    s.resumeId === "profile-resume"
      ? profileResumeReady
      : isUsableResumeText(attachedResume?.content);
  const reviewedQuestions = (s.applicationQuestions || []).map((question) => {
    const isTextQuestion = !["dropdown", "multiple_choice"].includes(
      question.questionType,
    );
    const answer = isTextQuestion
      ? (draftAnswers[question.id] ?? question.answer ?? "")
      : question.answer || "";
    return {
      ...question,
      answer,
      verified:
        question.verified === true && answer === (question.answer || ""),
    };
  });
  const requiredQuestions = reviewedQuestions.filter(
    (question) => question.required !== false,
  );
  const answeredQuestionCount = requiredQuestions.filter(
    isValidApplicationAnswer,
  ).length;
  const verifiedQuestionCount = requiredQuestions.filter(
    isApplicationQuestionReady,
  ).length;
  const questionsReady = reviewedQuestions.every(isApplicationQuestionReady);
  const resumeLabel = attachedResume?.name
    ? attachedResume.name
    : s.resumeId === "profile-resume"
      ? "Original profile resume"
      : "No resume attached";
  const updatePacket = async (body) => {
    setExternalSubmissionVerified(false);
    const update = packetUpdateQueue.current
      .catch(() => {})
      .then(async () => {
        await api(`/api/submissions/${s.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        await reload();
        return true;
      });
    packetUpdateQueue.current = update.catch(() => {});
    return (await update.catch(() => false)) === true;
  };
  const updateChecklist = async (id, done) => {
    await updatePacket({
      checklistItem: { id, done },
      status: "ready",
    });
  };
  const updateQuestion = async (id, answer) => {
    const saved = await updatePacket({
      applicationQuestion: { id, answer, verified: false },
    });
    if (saved)
      setDirtyAnswerIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
  };
  const verifyQuestion = async (id, verified) => {
    const question = (s.applicationQuestions || []).find(
      (candidate) => candidate.id === id,
    );
    const isTextQuestion = !["dropdown", "multiple_choice"].includes(
      question?.questionType,
    );
    const saved = await updatePacket({
      applicationQuestion: {
        id,
        answer: isTextQuestion
          ? (draftAnswers[id] ?? question?.answer ?? "")
          : question?.answer || "",
        verified,
      },
    });
    if (saved)
      setDirtyAnswerIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
  };
  const recordExternalSubmission = async () => {
    if (
      recordingSubmissionRef.current ||
      !s.checklist.every((item) => item.done) ||
      !externalSubmissionVerified ||
      !selectedResumeReady ||
      !questionsReady
    )
      return;
    recordingSubmissionRef.current = true;
    setRecordingSubmission(true);
    try {
      await packetUpdateQueue.current.catch(() => {});
      await api(`/api/submissions/${s.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ confirmedByUser: true }),
      });
      setExternalSubmissionVerified(false);
      await reload();
    } catch {
      // Preserve the user's explicit verification so a failed local write can retry.
    } finally {
      recordingSubmissionRef.current = false;
      setRecordingSubmission(false);
    }
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
        <h3>Application documents</h3>
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
          {answerDraftRestored && (
            <p className="v2-draft-restored" role="status">
              Unsaved application answers restored for review.
            </p>
          )}
          <div className="v2-packet-section-heading">
            <div>
              <h3>Application Questions</h3>
              <p>
                Reference answers are remembered in About Me. External forms may
                phrase or constrain questions differently, so verify every
                answer on the employer&apos;s site.
              </p>
            </div>
            <span>
              {answeredQuestionCount}/{requiredQuestions.length} answered
              {` · ${verifiedQuestionCount}/${requiredQuestions.length} verified`}
            </span>
          </div>
          {s.applicationQuestions.map((question) => {
            const prompt = (
              <span>
                {question.question}
                {question.required !== false && <b aria-hidden="true"> *</b>}
                {question.answer?.trim() && <em>Remembered</em>}
              </span>
            );
            if (question.questionType === "multiple_choice") {
              return (
                <div className="v2-question-card" key={question.id}>
                  <fieldset>
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
                  <QuestionVerification
                    question={question}
                    onChange={verifyQuestion}
                  />
                </div>
              );
            }
            if (question.questionType === "dropdown") {
              return (
                <div className="v2-question-card" key={question.id}>
                  <label>
                    {prompt}
                    <select
                      name={`question-${question.id}`}
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
                  <QuestionVerification
                    question={question}
                    onChange={verifyQuestion}
                  />
                </div>
              );
            }
            return (
              <div className="v2-question-card" key={question.id}>
                <label>
                  {prompt}
                  <textarea
                    name={`question-${question.id}`}
                    rows={2}
                    maxLength={10000}
                    value={draftAnswers[question.id] ?? question.answer ?? ""}
                    placeholder="Enter your answer…"
                    onChange={(event) => {
                      setDraftAnswers((answers) => ({
                        ...answers,
                        [question.id]: event.target.value,
                      }));
                      setDirtyAnswerIds((current) =>
                        new Set(current).add(question.id),
                      );
                      setAnswerDraftRestored(false);
                    }}
                    onBlur={(event) => {
                      if (event.target.value !== (question.answer || ""))
                        updateQuestion(question.id, event.target.value);
                    }}
                  />
                </label>
                <QuestionVerification
                  question={
                    reviewedQuestions.find(
                      (candidate) => candidate.id === question.id,
                    ) || question
                  }
                  onChange={verifyQuestion}
                />
              </div>
            );
          })}
          {!questionsReady && (
            <p className="error-text" role="alert">
              Answer every required question, compare it with the employer form,
              and explicitly verify each response before recording the external
              submission.
            </p>
          )}
        </section>
      )}
      <section className="v2-packet-section v2-packet-checklist">
        <h3>Review checklist</h3>
        {s.checklist.map((item) => (
          <label className="check" key={item.id}>
            <input
              type="checkbox"
              name={`checklist-${s.id}-${item.id}`}
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
            name={`resume-attachment-${s.id}`}
            value={s.resumeId || ""}
            onChange={(event) => updatePacket({ resumeId: event.target.value })}
          >
            <option value="">No resume attached</option>
            <option value="profile-resume" disabled={!profileResumeReady}>
              Original profile resume
              {profileResumeReady ? "" : " — add resume first"}
            </option>
            {state.resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.name}
              </option>
            ))}
          </select>
          {!selectedResumeReady && (
            <small className="error-text" role="alert">
              Attach a real resume before recording this submission.
            </small>
          )}
        </label>
        <label>
          Cover letter attachment
          <select
            name={`cover-letter-attachment-${s.id}`}
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
        <label className="check v2-submit-confirmation">
          <input
            type="checkbox"
            name={`external-submission-confirmed-${s.id}`}
            checked={externalSubmissionVerified}
            onChange={(event) =>
              setExternalSubmissionVerified(event.target.checked)
            }
          />
          I personally checked the employer&apos;s confirmation page or email
          and verified this application was submitted successfully.
        </label>
        <small className="v2-submit-safety-note">
          Do not confirm for a saved draft, validation error, incomplete upload,
          CAPTCHA, or form that merely closed.
        </small>
        <button
          className="success"
          disabled={
            recordingSubmission ||
            !s.checklist.every((x) => x.done) ||
            !externalSubmissionVerified ||
            !selectedResumeReady ||
            !questionsReady
          }
          aria-busy={recordingSubmission}
          onClick={recordExternalSubmission}
        >
          <CheckCircle2 size={16} />
          {recordingSubmission ? "Recording…" : "I submitted this externally"}
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
const normalizeCoverLetterWizard = (value) => {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isInteger(value.step) ||
    value.step < 1 ||
    value.step > 5 ||
    typeof value.templateId !== "string" ||
    typeof value.templateName !== "string" ||
    typeof value.templateContent !== "string"
  )
    return null;
  const text = (field, limit) =>
    typeof value[field] === "string" ? value[field].slice(0, limit) : "";
  const result =
    value.result &&
    typeof value.result === "object" &&
    typeof value.result.id === "string" &&
    typeof value.result.title === "string" &&
    typeof value.result.body === "string"
      ? {
          id: value.result.id.slice(0, 200),
          title: value.result.title.slice(0, 300),
          body: value.result.body.slice(0, 100000),
        }
      : null;
  if (value.step === 5 && !result) return null;
  return {
    step: value.step,
    templateId: value.templateId.slice(0, 200),
    templateName: value.templateName.slice(0, 300),
    documentName:
      text("documentName", 300) ||
      `Cover Letter Template - ${new Date().toLocaleDateString()}`,
    templateContent: value.templateContent.slice(0, 100000),
    resumeId: text("resumeId", 200),
    atsTemplateId: text("atsTemplateId", 200),
    jobId: text("jobId", 200),
    jobCompany: text("jobCompany", 300),
    jobTitle: text("jobTitle", 500),
    jobDescription: text("jobDescription", 5000),
    promptInstructions: text("promptInstructions", 5000),
    coverLetterInstructions: text("coverLetterInstructions", 5000),
    promptApplied: Boolean(value.promptApplied),
    result,
  };
};
const SAVED_LETTER_DRAFT_KEY = "jobhuntr-saved-cover-letter-draft";
const readSavedLetterDraft = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(SAVED_LETTER_DRAFT_KEY));
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.title !== "string" ||
      typeof value.body !== "string" ||
      typeof value.baselineUpdatedAt !== "string"
    )
      return null;
    return {
      id: value.id.slice(0, 200),
      title: value.title.slice(0, 300),
      body: value.body.slice(0, 100000),
      baselineUpdatedAt: value.baselineUpdatedAt.slice(0, 100),
    };
  } catch {
    return null;
  }
};
const clearSavedLetterDraft = () =>
  sessionStorage.removeItem(SAVED_LETTER_DRAFT_KEY);
const templateDialogDigest = (dialog) =>
  dialog
    ? JSON.stringify({
        id: dialog.id,
        step: dialog.step,
        completedSteps: dialog.completedSteps,
        name: dialog.name,
        description: dialog.description,
        originalResume: dialog.originalResume,
        editedResume: dialog.editedResume,
        additionalExperience: dialog.additionalExperience,
        testJobId: dialog.testJobId,
        jobDescription: dialog.jobDescription,
        sections: dialog.sections,
      })
    : "";
const ATS_TEMPLATE_DRAFT_KEY = "jobhuntr-ats-template-wizard-draft";
const normalizeTemplateScore = (value) =>
  value && typeof value === "object"
    ? {
        score: Math.max(0, Math.min(100, Number(value.score) || 0)),
        keywordHits: Array.isArray(value.keywordHits)
          ? value.keywordHits
              .filter((item) => typeof item === "string")
              .slice(0, 100)
              .map((item) => item.slice(0, 200))
          : [],
        suggestions: Array.isArray(value.suggestions)
          ? value.suggestions
              .filter((item) => typeof item === "string")
              .slice(0, 50)
              .map((item) => item.slice(0, 1000))
          : [],
      }
    : null;
const readTemplateDialogDraft = () => {
  try {
    const raw = sessionStorage.getItem(ATS_TEMPLATE_DRAFT_KEY);
    if (!raw) return null;
    if (raw.length > 350000) {
      sessionStorage.removeItem(ATS_TEMPLATE_DRAFT_KEY);
      return null;
    }
    const value = JSON.parse(raw);
    const dialog = value?.dialog;
    if (
      !dialog ||
      typeof dialog !== "object" ||
      !Number.isInteger(dialog.step) ||
      dialog.step < 1 ||
      dialog.step > 5 ||
      typeof dialog.name !== "string" ||
      typeof dialog.editedResume !== "string"
    ) {
      sessionStorage.removeItem(ATS_TEMPLATE_DRAFT_KEY);
      return null;
    }
    const text = (field, limit) =>
      typeof dialog[field] === "string" ? dialog[field].slice(0, limit) : "";
    return {
      baseline:
        typeof value.baseline === "string"
          ? value.baseline.slice(0, 350000)
          : "",
      sourceUpdatedAt:
        typeof value.sourceUpdatedAt === "string"
          ? value.sourceUpdatedAt.slice(0, 100)
          : "",
      dialog: {
        id: typeof dialog.id === "string" ? dialog.id.slice(0, 200) : null,
        step: dialog.step,
        completedSteps: Array.isArray(dialog.completedSteps)
          ? [
              ...new Set(
                dialog.completedSteps.filter((step) =>
                  [1, 2, 3, 4].includes(step),
                ),
              ),
            ]
          : [],
        editorView: ["split", "code", "preview"].includes(dialog.editorView)
          ? dialog.editorView
          : "split",
        name: dialog.name.slice(0, 300),
        description: text("description", 2000),
        originalResume: text("originalResume", 100000),
        editedResume: dialog.editedResume.slice(0, 100000),
        additionalExperience: text("additionalExperience", 2000),
        testJobId: text("testJobId", 200),
        jobDescription: text("jobDescription", 5000),
        uploadedFileName: text("uploadedFileName", 500),
        extractingFile: false,
        uploadError: "",
        scoring: false,
        scoreResult: normalizeTemplateScore(dialog.scoreResult),
        initialScoreResult: normalizeTemplateScore(dialog.initialScoreResult),
        optimizedResume: text("optimizedResume", 102000),
        sections: text("sections", 2000),
        newSection: "",
      },
    };
  } catch {
    sessionStorage.removeItem(ATS_TEMPLATE_DRAFT_KEY);
    return null;
  }
};
const clearTemplateDialogDraft = () =>
  sessionStorage.removeItem(ATS_TEMPLATE_DRAFT_KEY);
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
  const [savedLetterSnapshot, setSavedLetterSnapshot] = useState(null);
  const [confirmDiscardLetter, setConfirmDiscardLetter] = useState(false);
  const [letterWizard, setLetterWizard] = useState(() => {
    if (mode !== "cover-letter") return null;
    try {
      const saved = sessionStorage.getItem("jobhuntr-cover-letter-wizard");
      const restored = saved
        ? normalizeCoverLetterWizard(JSON.parse(saved))
        : null;
      if (saved && !restored)
        sessionStorage.removeItem("jobhuntr-cover-letter-wizard");
      return restored;
    } catch {
      sessionStorage.removeItem("jobhuntr-cover-letter-wizard");
      return null;
    }
  });
  const [editingLetterName, setEditingLetterName] = useState(false);
  const [letterNameDraft, setLetterNameDraft] = useState("");
  const [coverSourcePreview, setCoverSourcePreview] = useState(null);
  const coverSourcePreviewReturnRef = useRef(null);
  const coverSourcePreviewWasOpenRef = useRef(false);
  const openCoverSourcePreview = (preview) => {
    coverSourcePreviewReturnRef.current = document.activeElement;
    setCoverSourcePreview(preview);
  };
  const closeCoverSourcePreview = () => {
    setCoverSourcePreview(null);
  };
  useEffect(() => {
    if (coverSourcePreview) {
      coverSourcePreviewWasOpenRef.current = true;
      return;
    }
    if (!coverSourcePreviewWasOpenRef.current) return;
    coverSourcePreviewWasOpenRef.current = false;
    coverSourcePreviewReturnRef.current?.focus();
  }, [coverSourcePreview]);
  useEffect(() => {
    if (!coverSourcePreview) return undefined;
    const closePreview = (event) => {
      if (event.key === "Escape") {
        setCoverSourcePreview(null);
      }
    };
    window.addEventListener("keydown", closePreview);
    return () => window.removeEventListener("keydown", closePreview);
  }, [coverSourcePreview]);
  const [preview, setPreview] = useState(state.resumes[0] || null);
  const [savingResume, setSavingResume] = useState(false);
  const [scoringResume, setScoringResume] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [finishingLetter, setFinishingLetter] = useState(false);
  const [savingLetter, setSavingLetter] = useState(false);
  const savingResumeRef = useRef(false);
  const scoringResumeRef = useRef(false);
  const savingTemplateRef = useRef(false);
  const templateOperationRef = useRef(false);
  const generatingLetterRef = useRef(false);
  const finishingLetterRef = useRef(false);
  const savingLetterRef = useRef(false);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateSort, setTemplateSort] = useState("name");
  const [templateSortOrder, setTemplateSortOrder] = useState("asc");
  const restoredTemplateDraftRef = useRef(null);
  if (restoredTemplateDraftRef.current === null) {
    const draft = mode === "resume" ? readTemplateDialogDraft() : null;
    const source = draft?.dialog.id
      ? state.templates.find((item) => item.id === draft.dialog.id)
      : null;
    const valid = Boolean(
      draft?.baseline &&
      (!draft.dialog.id ||
        (source &&
          draft.sourceUpdatedAt ===
            (source.updatedAt || source.createdAt || ""))),
    );
    restoredTemplateDraftRef.current = valid
      ? draft
      : { dialog: null, baseline: "" };
    if (draft && !valid) clearTemplateDialogDraft();
  }
  const [templateDialog, setTemplateDialog] = useState(
    restoredTemplateDraftRef.current.dialog,
  );
  const [templateDialogBaseline, setTemplateDialogBaseline] = useState(
    restoredTemplateDraftRef.current.baseline,
  );
  const [confirmDiscardTemplate, setConfirmDiscardTemplate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyTemplate, setHistoryTemplate] = useState("all");
  const [showAllResumes, setShowAllResumes] = useState(false);
  const attachedPacketCount = (field, id) =>
    state.submissions.filter((submission) => submission[field] === id).length;
  const resumeReady = isUsableResumeText(resume);
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
  const templateDialogOpen = Boolean(templateDialog);
  const templateDialogBusy = Boolean(
    savingTemplate || templateDialog?.scoring || templateDialog?.extractingFile,
  );
  const hasUnsavedTemplateChanges = Boolean(
    templateDialog &&
    templateDialogBaseline &&
    templateDialogDigest(templateDialog) !== templateDialogBaseline,
  );
  useEffect(() => {
    if (
      mode !== "resume" ||
      !templateDialog ||
      !templateDialogBaseline ||
      !hasUnsavedTemplateChanges
    )
      return;
    try {
      const source = templateDialog.id
        ? state.templates.find((item) => item.id === templateDialog.id)
        : null;
      sessionStorage.setItem(
        ATS_TEMPLATE_DRAFT_KEY,
        JSON.stringify({
          dialog: templateDialog,
          baseline: templateDialogBaseline,
          sourceUpdatedAt: source?.updatedAt || source?.createdAt || "",
        }),
      );
    } catch {
      // The wizard remains usable if a constrained webview rejects draft storage.
    }
  }, [
    hasUnsavedTemplateChanges,
    mode,
    state.templates,
    templateDialog,
    templateDialogBaseline,
  ]);
  const closeTemplateDialog = useCallback(() => {
    if (templateOperationRef.current) return;
    if (hasUnsavedTemplateChanges) {
      setConfirmDiscardTemplate(true);
      return;
    }
    clearTemplateDialogDraft();
    setTemplateDialog(null);
    setTemplateDialogBaseline("");
  }, [hasUnsavedTemplateChanges]);
  const closeTemplateDialogRef = useRef(closeTemplateDialog);
  useEffect(() => {
    closeTemplateDialogRef.current = closeTemplateDialog;
  }, [closeTemplateDialog]);
  useEffect(() => {
    if (!templateDialogOpen) return undefined;
    const returnFocus = document.activeElement;
    templateDialogCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !templateOperationRef.current)
        closeTemplateDialogRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [templateDialogOpen]);
  const openTemplateDialog = (template = null) => {
    clearTemplateDialogDraft();
    const dialog = {
      id: template?.id || null,
      step: 1,
      completedSteps: template ? [1, 2, 3] : [],
      editorView: "split",
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
      jobDescription:
        template?.jobDescription || state.jobs[0]?.description || "",
      uploadedFileName: template?.originalResume ? "Saved resume" : "",
      extractingFile: false,
      uploadError: "",
      scoreResult: null,
      sections: (
        template?.sections || ["Summary", "Skills", "Experience", "Education"]
      ).join(", "),
      newSection: "",
    };
    setTemplateDialog(dialog);
    setTemplateDialogBaseline(templateDialogDigest(dialog));
    setConfirmDiscardTemplate(false);
  };
  const loadTemplateResumeFile = async (file) => {
    if (!file || templateOperationRef.current) return;
    templateOperationRef.current = true;
    setTemplateDialog((current) => ({
      ...current,
      extractingFile: true,
      uploadError: "",
      uploadedFileName: file.name,
      originalResume: "",
      editedResume: "",
    }));
    try {
      const content = await extractResumeFileText(file);
      setTemplateDialog((current) => ({
        ...current,
        extractingFile: false,
        uploadError: "",
        uploadedFileName: file.name,
        originalResume: content,
        editedResume: content,
      }));
    } catch (error) {
      setTemplateDialog((current) => ({
        ...current,
        extractingFile: false,
        uploadError: error.message,
        originalResume: "",
        editedResume: "",
      }));
    } finally {
      templateOperationRef.current = false;
    }
  };
  const saveTemplate = async () => {
    if (templateOperationRef.current) return;
    savingTemplateRef.current = true;
    templateOperationRef.current = true;
    setSavingTemplate(true);
    const payload = {
      name: templateDialog.name,
      description: templateDialog.description,
      originalResume: templateDialog.originalResume,
      editedResume: templateDialog.editedResume,
      additionalExperience: templateDialog.additionalExperience,
      testJobId: templateDialog.testJobId,
      jobDescription: templateDialog.jobDescription,
      sections: templateDialog.sections
        .split(",")
        .map((section) => section.trim())
        .filter(Boolean),
    };
    try {
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
      clearTemplateDialogDraft();
      setTemplateDialog(null);
      setTemplateDialogBaseline("");
      await reload();
    } catch {
      // Keep the completed template wizard available for retry.
    } finally {
      savingTemplateRef.current = false;
      templateOperationRef.current = false;
      setSavingTemplate(false);
    }
  };
  const advanceTemplateWizard = async () => {
    if (templateDialog.step !== 4) {
      setTemplateDialog({
        ...templateDialog,
        completedSteps: [
          ...new Set([
            ...(templateDialog.completedSteps || []),
            templateDialog.step,
          ]),
        ],
        step: templateDialog.step + 1,
      });
      return;
    }
    if (templateOperationRef.current) return;
    templateOperationRef.current = true;
    const testJob = {
      title:
        state.jobs.find((job) => job.id === templateDialog.testJobId)?.title ||
        "Target role",
      description: templateDialog.jobDescription,
      tags: [],
    };
    const score = (resumeText) =>
      api("/api/resume/score", {
        method: "POST",
        body: JSON.stringify({
          resumeText,
          jobId: templateDialog.testJobId,
          job: testJob,
        }),
      });
    const optimizedResume = [
      templateDialog.editedResume,
      templateDialog.additionalExperience
        ? `Additional Experience & Skills\n${templateDialog.additionalExperience}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    setTemplateDialog((current) => ({ ...current, scoring: true }));
    try {
      const [initialScoreResult, scoreResult] = await Promise.all([
        score(templateDialog.originalResume),
        score(optimizedResume),
      ]);
      setTemplateDialog((current) => ({
        ...current,
        completedSteps: [...new Set([...(current.completedSteps || []), 4])],
        initialScoreResult,
        optimizedResume,
        scoreResult,
        scoring: false,
        step: 5,
      }));
    } catch {
      // Keep the completed job details in step 4 so scoring can be retried.
      setTemplateDialog((current) => ({ ...current, scoring: false }));
    } finally {
      templateOperationRef.current = false;
    }
  };
  const saveResume = async () => {
    if (savingResumeRef.current) return;
    savingResumeRef.current = true;
    setSavingResume(true);
    const content = resumeRef.current?.value ?? resume;
    setResume(content);
    try {
      const saved = await api("/api/resumes", {
        method: "POST",
        body: JSON.stringify({
          name,
          templateId,
          jobId,
          content,
          updateProfile: true,
        }),
      });
      setPreview(saved);
      await reload();
    } catch {
      // Keep the editor intact so the user can retry without losing work.
    } finally {
      savingResumeRef.current = false;
      setSavingResume(false);
    }
  };
  const scoreResume = async () => {
    if (scoringResumeRef.current) return;
    scoringResumeRef.current = true;
    setScoringResume(true);
    try {
      setScore(
        await api("/api/resume/score", {
          method: "POST",
          body: JSON.stringify({ resumeText: resume, jobId }),
        }),
      );
    } catch {
      // Preserve the previous result and allow a deliberate retry.
    } finally {
      scoringResumeRef.current = false;
      setScoringResume(false);
    }
  };
  const openLetterWizard = () =>
    setLetterWizard({
      step: 1,
      templateId: COVER_LETTER_TEMPLATES[0].id,
      templateName: COVER_LETTER_TEMPLATES[0].name,
      documentName: `Cover Letter Template - ${new Date().toLocaleDateString()}`,
      templateContent: COVER_LETTER_TEMPLATES[0].content,
      resumeId:
        state.resumes.find((item) => isUsableResumeText(item.content))?.id ||
        (isUsableResumeText(state.profile.resumeText) ? "profile-resume" : ""),
      jobId: jobId || state.jobs[0]?.id || "",
      jobDescription:
        state.jobs.find((item) => item.id === (jobId || state.jobs[0]?.id))
          ?.description || "",
    });
  const generateLetter = async (wizard = null, keepWizard = false) => {
    if (generatingLetterRef.current) return;
    generatingLetterRef.current = true;
    setGeneratingLetter(true);
    const options = wizard
      ? {
          ...wizard,
          job: wizard.jobId
            ? undefined
            : {
                title: wizard.jobTitle,
                company: wizard.jobCompany,
                description: wizard.jobDescription,
              },
        }
      : { jobId, resumeId: "profile-resume" };
    try {
      const created = await api("/api/cover-letters", {
        method: "POST",
        body: JSON.stringify(options),
      });
      setLetter(created);
      setLetterWizard(
        keepWizard ? { ...wizard, step: 5, result: created } : null,
      );
      await reload();
    } catch {
      // Keep the wizard inputs intact so generation can be retried.
    } finally {
      generatingLetterRef.current = false;
      setGeneratingLetter(false);
    }
  };
  const finishLetterWizard = async () => {
    if (!letterWizard?.result || finishingLetterRef.current) return;
    finishingLetterRef.current = true;
    setFinishingLetter(true);
    try {
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
    } catch {
      // Keep the generated letter open so saving can be retried.
    } finally {
      finishingLetterRef.current = false;
      setFinishingLetter(false);
    }
  };
  const saveLetter = async () => {
    if (!letter || savingLetterRef.current) return;
    savingLetterRef.current = true;
    setSavingLetter(true);
    try {
      const saved = await api(`/api/cover-letters/${letter.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: letter.title, body: letter.body }),
      });
      setLetter(saved);
      setSavedLetterSnapshot({ title: saved.title, body: saved.body });
      clearSavedLetterDraft();
      await reload();
    } catch {
      // Keep unsaved edits in place so the user can retry.
    } finally {
      savingLetterRef.current = false;
      setSavingLetter(false);
    }
  };
  const editSavedLetter = (item) => {
    const draft = readSavedLetterDraft();
    const restored =
      draft?.id === item.id &&
      draft.baselineUpdatedAt === (item.updatedAt || item.createdAt || "")
        ? { ...item, title: draft.title, body: draft.body }
        : item;
    if (draft && restored === item) clearSavedLetterDraft();
    setLetter(restored);
    setSavedLetterSnapshot({ title: item.title, body: item.body });
    setConfirmDiscardLetter(false);
  };
  const hasUnsavedLetterChanges = Boolean(
    letter &&
    savedLetterSnapshot &&
    (letter.title !== savedLetterSnapshot.title ||
      letter.body !== savedLetterSnapshot.body),
  );
  useEffect(() => {
    if (
      mode !== "cover-letter" ||
      !letter ||
      !savedLetterSnapshot ||
      !hasUnsavedLetterChanges
    )
      return;
    sessionStorage.setItem(
      SAVED_LETTER_DRAFT_KEY,
      JSON.stringify({
        id: letter.id,
        title: letter.title.slice(0, 300),
        body: letter.body.slice(0, 100000),
        baselineUpdatedAt: letter.updatedAt || letter.createdAt || "",
      }),
    );
  }, [hasUnsavedLetterChanges, letter, mode, savedLetterSnapshot]);
  const closeSavedLetter = () => {
    if (savingLetterRef.current) return;
    if (hasUnsavedLetterChanges) {
      setConfirmDiscardLetter(true);
      return;
    }
    setLetter(null);
    setSavedLetterSnapshot(null);
  };
  if (mode === "cover-letter") {
    if (letterWizard) {
      const wizardSteps = ["Template", "Edit", "Resume", "Job Info", "Result"];
      const selectedJob = state.jobs.find(
        (item) => item.id === letterWizard.jobId,
      );
      const selectedResume = state.resumes.find(
        (item) => item.id === letterWizard.resumeId,
      );
      const profileResumeReady = isUsableResumeText(state.profile.resumeText);
      const coverSourceReady = letterWizard.atsTemplateId
        ? profileResumeReady
        : letterWizard.resumeId === "profile-resume"
          ? profileResumeReady
          : isUsableResumeText(selectedResume?.content);
      const coverWizardBusy = generatingLetter || finishingLetter;
      return (
        <section className="v2-cover-wizard">
          <div className="v2-cover-wizard-head">
            <button
              className="secondary"
              aria-label="Back to cover letters"
              disabled={coverWizardBusy}
              onClick={() => {
                if (!generatingLetterRef.current && !finishingLetterRef.current)
                  setLetterWizard(null);
              }}
            >
              ←
            </button>
            <div className="v2-cover-wizard-title">
              {editingLetterName ? (
                <div className="v2-cover-name-editor">
                  <input
                    autoFocus
                    name="cover-letter-template-name"
                    aria-label="Cover letter template name"
                    maxLength={300}
                    value={letterNameDraft}
                    onChange={(event) => setLetterNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        setLetterNameDraft(letterWizard.documentName);
                        setEditingLetterName(false);
                      }
                    }}
                    onBlur={() => {
                      const documentName = letterNameDraft.trim();
                      if (documentName)
                        setLetterWizard({ ...letterWizard, documentName });
                      setEditingLetterName(false);
                    }}
                  />
                  <Check size={18} aria-hidden="true" />
                </div>
              ) : (
                <button
                  className="v2-cover-name-button"
                  aria-label="Edit cover letter template name"
                  onClick={() => {
                    setLetterNameDraft(letterWizard.documentName);
                    setEditingLetterName(true);
                  }}
                >
                  <h2>{letterWizard.documentName}</h2>
                  <Pencil size={16} aria-hidden="true" />
                </button>
              )}
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
                <button
                  type="button"
                  aria-label={`Go to ${label}`}
                  aria-current={
                    letterWizard.step === index + 1 ? "step" : undefined
                  }
                  disabled={coverWizardBusy || index + 1 >= letterWizard.step}
                  onClick={() =>
                    setLetterWizard({ ...letterWizard, step: index + 1 })
                  }
                >
                  {letterWizard.step > index + 1 ? "✓" : index + 1}
                </button>
                <b>{label}</b>
              </li>
            ))}
          </ol>
          <div className="card v2-cover-step">
            {letterWizard.step === 1 && (
              <>
                <div className="v2-cover-step-head v2-cover-template-step-head">
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
                          <ChevronLeft size={32} />
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
                          <ChevronRight size={32} />
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
                      name="cover-letter-template-content"
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
                    name="cover-letter-optimization-prompt"
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
                  <div
                    className={`v2-cover-source-card ${
                      letterWizard.resumeId === "profile-resume" &&
                      !letterWizard.atsTemplateId
                        ? "selected"
                        : ""
                    }`}
                  >
                    <button
                      className="v2-cover-source-select"
                      disabled={!profileResumeReady}
                      onClick={() =>
                        setLetterWizard({
                          ...letterWizard,
                          resumeId: "profile-resume",
                          atsTemplateId: "",
                        })
                      }
                    >
                      <FileText size={20} />
                      <span>
                        <b>Profile resume</b>
                        <small>
                          {profileResumeReady
                            ? "Use your current profile resume text"
                            : "Add a real profile resume first"}
                        </small>
                      </span>
                    </button>
                    {profileResumeReady && (
                      <button
                        className="v2-cover-source-preview-button"
                        aria-label="Preview profile resume"
                        onClick={() =>
                          openCoverSourcePreview({
                            type: "resume",
                            name: "Profile resume",
                            content: state.profile.resumeText,
                          })
                        }
                      >
                        <Eye size={17} />
                      </button>
                    )}
                  </div>
                  {state.resumes.map((item) => (
                    <div
                      className={`v2-cover-source-card ${letterWizard.resumeId === item.id ? "selected" : ""}`}
                      key={item.id}
                    >
                      <button
                        className="v2-cover-source-select"
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
                      <button
                        className="v2-cover-source-preview-button"
                        aria-label={`Preview ${item.name}`}
                        onClick={() =>
                          openCoverSourcePreview({
                            type: "resume",
                            name: item.name,
                            content: item.content,
                          })
                        }
                      >
                        <Eye size={17} />
                      </button>
                    </div>
                  ))}
                </div>
                <h4 className="v2-cover-option-title">
                  Option 2: Select ATS Template
                </h4>
                <div className="v2-cover-resume-list v2-cover-ats-list">
                  {state.templates.map((template) => (
                    <div
                      className={`v2-cover-source-card ${letterWizard.atsTemplateId === template.id ? "selected" : ""}`}
                      key={template.id}
                    >
                      <button
                        className="v2-cover-source-select"
                        disabled={!profileResumeReady}
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
                      <button
                        className="v2-cover-source-preview-button"
                        aria-label={`Preview ${template.name} ATS template`}
                        onClick={() =>
                          openCoverSourcePreview({
                            type: "ats",
                            name: template.name,
                            content:
                              template.editedResume ||
                              template.originalResume ||
                              state.profile.resumeText,
                          })
                        }
                      >
                        <Eye size={17} />
                      </button>
                    </div>
                  ))}
                </div>
                {!coverSourceReady && (
                  <p className="error-text" role="alert">
                    Add or select a valid resume before continuing. Cover
                    letters must be grounded in your real experience.
                  </p>
                )}
                <label className="v2-cover-instructions">
                  Cover Letter Instructions
                  <textarea
                    name="cover-letter-instructions"
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
                      name="cover-letter-tracked-job"
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
                {!letterWizard.jobId && (
                  <div className="double">
                    <label>
                      Company
                      <input
                        name="cover-letter-target-company"
                        aria-label="Target company"
                        value={letterWizard.jobCompany || ""}
                        onChange={(event) =>
                          setLetterWizard({
                            ...letterWizard,
                            jobCompany: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Role
                      <input
                        name="cover-letter-target-role"
                        aria-label="Target role"
                        value={letterWizard.jobTitle || ""}
                        onChange={(event) =>
                          setLetterWizard({
                            ...letterWizard,
                            jobTitle: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
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
                    name="cover-letter-job-description"
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
                      name="generated-cover-letter-title"
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
                      name="generated-cover-letter-content"
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
              {letterWizard.step === 1 ? (
                <span aria-hidden="true" />
              ) : (
                <button
                  className="secondary"
                  disabled={generatingLetter || finishingLetter}
                  onClick={() =>
                    setLetterWizard({
                      ...letterWizard,
                      step: letterWizard.step - 1,
                    })
                  }
                >
                  <ChevronLeft size={16} /> Previous
                </button>
              )}
              {letterWizard.step < 4 ? (
                <button
                  disabled={
                    coverWizardBusy ||
                    (letterWizard.step === 3 && !coverSourceReady)
                  }
                  onClick={() =>
                    setLetterWizard({
                      ...letterWizard,
                      step: letterWizard.step + 1,
                    })
                  }
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : letterWizard.step === 4 ? (
                <button
                  disabled={
                    generatingLetter ||
                    !coverSourceReady ||
                    (!letterWizard.jobId &&
                      (!letterWizard.jobCompany?.trim() ||
                        !letterWizard.jobTitle?.trim() ||
                        !letterWizard.jobDescription?.trim()))
                  }
                  aria-busy={generatingLetter}
                  onClick={() => generateLetter(letterWizard, true)}
                >
                  <Sparkles size={16} />{" "}
                  {generatingLetter ? "Generating…" : "Generate Cover Letter"}
                </button>
              ) : (
                <button
                  disabled={finishingLetter}
                  aria-busy={finishingLetter}
                  onClick={finishLetterWizard}
                >
                  <Save size={16} />{" "}
                  {finishingLetter ? "Saving…" : "Save and Finish"}
                </button>
              )}
            </div>
          </div>
          {coverSourcePreview && (
            <>
              <button
                className="v2-cover-preview-backdrop"
                aria-label="Close source preview"
                onClick={closeCoverSourcePreview}
              />
              <aside
                className="v2-cover-preview-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cover-source-preview-title"
                onKeyDown={containDialogFocus}
              >
                <header>
                  <div>
                    {coverSourcePreview.type === "ats" ? (
                      <Sparkles size={20} />
                    ) : (
                      <FileText size={20} />
                    )}
                    <span>
                      <h2 id="cover-source-preview-title">
                        {coverSourcePreview.type === "ats"
                          ? "ATS Template Preview"
                          : "Resume Preview"}
                      </h2>
                      <p>{coverSourcePreview.name}</p>
                    </span>
                  </div>
                  <button
                    autoFocus
                    className="secondary"
                    aria-label="Close source preview"
                    onClick={closeCoverSourcePreview}
                  >
                    <X size={20} />
                  </button>
                </header>
                <div className="v2-cover-preview-page">
                  <h1>{state.profile.name || "Your Name"}</h1>
                  <p>{coverSourcePreview.content}</p>
                </div>
              </aside>
            </>
          )}
        </section>
      );
    }
    return (
      <section className="v2-document-page">
        <ConfirmDialog
          open={confirmDiscardLetter}
          title="Discard unsaved changes?"
          description="Your latest cover letter edits have not been saved. Discard them and return to Cover Letters?"
          confirmLabel="Discard Changes"
          busyLabel="Discarding…"
          onClose={() => setConfirmDiscardLetter(false)}
          onConfirm={() => {
            clearSavedLetterDraft();
            setLetter(null);
            setSavedLetterSnapshot(null);
          }}
        />
        <ConfirmDialog
          open={deleteTarget?.type === "letter"}
          title="Delete cover letter?"
          description={
            deleteTarget
              ? attachedPacketCount("coverLetterId", deleteTarget.item.id)
                ? `“${deleteTarget.item.title}” is attached to ${attachedPacketCount("coverLetterId", deleteTarget.item.id)} application packet${attachedPacketCount("coverLetterId", deleteTarget.item.id) === 1 ? "" : "s"}. Remove it from every packet before deleting it.`
                : `“${deleteTarget.item.title}” will be permanently removed from your local workspace.`
              : "This cover letter will be permanently removed."
          }
          confirmLabel={
            deleteTarget &&
            attachedPacketCount("coverLetterId", deleteTarget.item.id)
              ? "In use"
              : "Delete"
          }
          confirmDisabled={Boolean(
            deleteTarget &&
            attachedPacketCount("coverLetterId", deleteTarget.item.id),
          )}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await api(`/api/cover-letters/${deleteTarget.item.id}`, {
              method: "DELETE",
            });
            if (letter?.id === deleteTarget.item.id) {
              clearSavedLetterDraft();
              setLetter(null);
              setSavedLetterSnapshot(null);
            }
            await reload();
          }}
        />
        <div className="v2-document-page-head">
          <div>
            {letter ? (
              <>
                <button
                  className="secondary v2-cover-back-to-list"
                  disabled={savingLetter}
                  onClick={closeSavedLetter}
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
                    onClick={() => editSavedLetter(item)}
                  >
                    <span className="v2-letter-status" aria-hidden="true">
                      Ready
                    </span>
                    <span
                      className={`v2-letter-paper ${item.templateId || "minimal"}`}
                      aria-hidden="true"
                      style={(() => {
                        const theme =
                          COVER_LETTER_PREVIEW_THEMES[item.templateId] ||
                          COVER_LETTER_PREVIEW_THEMES.minimal;
                        return {
                          "--letter-accent": theme.accent,
                          "--letter-surface": theme.surface,
                          "--letter-font": theme.font,
                          "--letter-edge": theme.edge,
                        };
                      })()}
                    >
                      <b>{state.profile.name}</b>
                      <i />
                      <i />
                      <em>{item.title}</em>
                      <span>{item.body.slice(0, 460)}</span>
                    </span>
                  </button>
                  <footer>
                    <button onClick={() => editSavedLetter(item)}>
                      <b>{item.title}</b>
                      <small>
                        <Calendar size={13} />{" "}
                        {formatCalendarDate(item.updatedAt || item.createdAt)}
                      </small>
                      <span className="v2-letter-template-tag">
                        {item.templateName ||
                          COVER_LETTER_PREVIEW_THEMES[item.templateId]?.name ||
                          "Minimal"}
                      </span>
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
                  <h2>No Cover Letters Yet</h2>
                  <p>
                    Create your first cover letter using professional templates
                    and local assistance.
                  </p>
                  <button onClick={openLetterWizard}>
                    <Plus size={16} /> Create Your First Cover Letter
                  </button>
                </div>
              )}
            </div>
          )}
          {letter && (
            <div className="v2-letter-workspace">
              <div className="v2-letter-editor-toolbar">
                <div>
                  <b>Cover Letter Editor</b>
                  <span>
                    {letter.templateName ||
                      COVER_LETTER_PREVIEW_THEMES[letter.templateId]?.name ||
                      "Minimal"}{" "}
                    template
                  </span>
                </div>
                <div>
                  <a
                    className="secondary buttonlike"
                    href={`/print/cover-letter/${letter.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={15} /> Preview PDF
                  </a>
                  <button
                    disabled={savingLetter || !hasUnsavedLetterChanges}
                    aria-busy={savingLetter}
                    onClick={saveLetter}
                  >
                    <Save size={16} />
                    {savingLetter ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
              <div className="v2-letter-editor-split">
                <div className="v2-letter-source">
                  <label htmlFor="saved-cover-letter-title">
                    Document title
                  </label>
                  <input
                    id="saved-cover-letter-title"
                    name="cover-letter-title"
                    aria-label="Cover letter title"
                    value={letter.title}
                    onChange={(e) =>
                      setLetter({ ...letter, title: e.target.value })
                    }
                  />
                  <label htmlFor="saved-cover-letter-content">
                    Letter content
                  </label>
                  <textarea
                    id="saved-cover-letter-content"
                    name="cover-letter-content"
                    aria-label="Cover letter content"
                    className="letter"
                    value={letter.body}
                    onChange={(e) =>
                      setLetter({ ...letter, body: e.target.value })
                    }
                  />
                  <button
                    className="danger v2-letter-editor-delete"
                    onClick={() =>
                      setDeleteTarget({ type: "letter", item: letter })
                    }
                  >
                    <Trash2 size={15} /> Delete Cover Letter
                  </button>
                </div>
                <div className="v2-letter-live-preview">
                  <div>
                    <span>Cover Letter Preview</span>
                    <small>Updates as you type</small>
                  </div>
                  <div className="v2-letter-preview-canvas">
                    <iframe
                      sandbox=""
                      srcDoc={coverLetterPreviewDocument(
                        letter.body,
                        letter.templateId,
                      )}
                      title="Saved Cover Letter Preview"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="resume-studio">
      <ConfirmDialog
        open={confirmDiscardTemplate}
        title="Discard template changes?"
        description="Your ATS template wizard has unsaved changes. Discard them and close the editor?"
        confirmLabel="Discard Changes"
        busyLabel="Discarding…"
        onClose={() => setConfirmDiscardTemplate(false)}
        onConfirm={() => {
          clearTemplateDialogDraft();
          setTemplateDialog(null);
          setTemplateDialogBaseline("");
        }}
      />
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
            ? attachedPacketCount("resumeId", deleteTarget.item.id)
              ? `“${deleteTarget.item.name}” is attached to ${attachedPacketCount("resumeId", deleteTarget.item.id)} application packet${attachedPacketCount("resumeId", deleteTarget.item.id) === 1 ? "" : "s"}. Select another resume in every packet before deleting it.`
              : `“${deleteTarget.item.name}” will be permanently removed. Your base profile resume and template will remain available.`
            : "This generated resume will be permanently removed."
        }
        confirmLabel={
          deleteTarget && attachedPacketCount("resumeId", deleteTarget.item.id)
            ? "In use"
            : "Delete"
        }
        confirmDisabled={Boolean(
          deleteTarget && attachedPacketCount("resumeId", deleteTarget.item.id),
        )}
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
        <button
          className="v2-ats-create-button"
          onClick={() => openTemplateDialog()}
        >
          <Plus size={16} /> Create New Template
        </button>
      </div>
      <div className="v2-template-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            name="resume-template-search"
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
              title={`Edit ${template.name} template`}
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
                  {formatCalendarDate(template.updatedAt || template.createdAt)}
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
              name="resume-version-name"
              aria-label="Resume version name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Version name"
            />
            <select
              name="resume-template"
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
              name="resume-target-job"
              aria-label="Target job"
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value);
                setScore(null);
              }}
            >
              {state.jobs.map((j) => (
                <option value={j.id} key={j.id}>
                  {j.company} — {j.title}
                </option>
              ))}
            </select>
          </div>
          <textarea
            name="resume-content"
            aria-label="Resume content"
            ref={resumeRef}
            className="resume"
            value={resume}
            onChange={(e) => {
              setResume(e.target.value);
              setScore(null);
            }}
            placeholder={
              "SUMMARY\nYour concise positioning statement\n\nEXPERIENCE\n- Accomplished X, measured by Y"
            }
          />
          <div className="inline">
            <button
              disabled={!resumeReady || savingResume}
              aria-busy={savingResume}
              onClick={saveResume}
            >
              <Save size={16} /> {savingResume ? "Saving…" : "Save version"}
            </button>
            <button
              className="secondary"
              disabled={!resumeReady || scoringResume}
              aria-busy={scoringResume}
              onClick={scoreResume}
            >
              {scoringResume ? "Analyzing…" : "Analyze ATS fit"}
            </button>
          </div>
          {!resumeReady && (
            <p className="error-text" role="alert">
              Replace the placeholder with your real resume (at least 80
              characters) before saving or analyzing it.
            </p>
          )}
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
      <div className="v2-resume-history">
        <div className="v2-resume-history-head">
          <div>
            <h2>Generated Resumes</h2>
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
              name="resume-history-search"
              aria-label="Search resume history"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search by company, job title, or location..."
            />
          </div>
          <select
            name="resume-history-template"
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
                      {resumes.length} generated resume
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
                          setScore(null);
                          setName(item.name);
                          setTemplateId(item.templateId);
                          if (item.jobId) setJobId(item.jobId);
                        }}
                      >
                        <b>
                          {job
                            ? `${job.title} @ ${job.company}`
                            : item.name || "Generated Resume"}
                        </b>
                        <span>
                          {job?.location || "Local resume"} · Created{" "}
                          {formatCalendarDate(item.createdAt || item.updatedAt)}
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
            <p>
              No generated resumes found. Generate a resume from one of your
              templates to see it here.
            </p>
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
          aria-label={
            templateDialog.id ? "Edit Template" : "Create New Template"
          }
          onKeyDown={(event) => {
            if (event.key === "Escape" && !templateOperationRef.current)
              closeTemplateDialog();
            containDialogFocus(event);
          }}
        >
          <button
            className="v2-template-backdrop"
            tabIndex={-1}
            aria-label="Dismiss template editor"
            onClick={() => {
              if (!templateOperationRef.current) closeTemplateDialog();
            }}
          />
          <div className="v2-template-modal-content">
            <div className="v2-template-wizard-head">
              <button
                ref={templateDialogCloseRef}
                className="v2-template-wizard-back"
                aria-label="Close template editor"
                disabled={templateDialogBusy}
                onClick={closeTemplateDialog}
              >
                <ChevronLeft size={20} />
              </button>
              <div>
                <h3>{templateDialog.name || "New ATS Template"}</h3>
              </div>
              <div className="v2-template-wizard-meta">
                <small>Step {templateDialog.step} of 5</small>
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
                    className={`${
                      templateDialog.step === index + 1 ? "active current" : ""
                    } ${
                      templateDialog.completedSteps?.includes(index + 1)
                        ? "completed"
                        : ""
                    }`.trim()}
                    aria-current={
                      templateDialog.step === index + 1 ? "step" : undefined
                    }
                  >
                    <button
                      type="button"
                      className="v2-template-progress-step"
                      disabled={
                        templateDialogBusy ||
                        (templateDialog.step !== index + 1 &&
                          !templateDialog.completedSteps?.includes(index + 1))
                      }
                      aria-label={`Go to template step ${index + 1}: ${label}`}
                      onClick={() =>
                        setTemplateDialog({
                          ...templateDialog,
                          step: index + 1,
                        })
                      }
                    >
                      <i>
                        {templateDialog.completedSteps?.includes(index + 1) ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          index + 1
                        )}
                      </i>
                      <span>{label}</span>
                    </button>
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
                    name="ats-template-name"
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
                {!templateDialog.originalResume ? (
                  <label
                    className="v2-template-dropzone v2-a4-dropzone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!templateDialog.extractingFile) {
                        loadTemplateResumeFile(event.dataTransfer.files?.[0]);
                      }
                    }}
                  >
                    <span className="v2-a4-sheet" aria-hidden="true">
                      <i className="v2-a4-header" />
                      <i className="v2-a4-line wide" />
                      <i className="v2-a4-line" />
                      <i className="v2-a4-line" />
                      <i className="v2-a4-line" />
                      <i className="v2-a4-subheader" />
                      <i className="v2-a4-line wide" />
                      <i className="v2-a4-line" />
                      <i className="v2-a4-line" />
                    </span>
                    <span className="v2-a4-overlay">
                      {templateDialog.extractingFile ? (
                        <>
                          <b>Analyzing your resume locally…</b>
                          <small>This may take a moment</small>
                        </>
                      ) : (
                        <>
                          Click or drag and drop your current resume.
                          <small>
                            PDF, HTML, or text · processed only on this device
                          </small>
                        </>
                      )}
                    </span>
                    <input
                      name="ats-template-resume-file"
                      aria-label="Upload resume for ATS template"
                      type="file"
                      disabled={templateDialog.extractingFile}
                      accept=".pdf,.html,.htm,.txt,text/plain,text/html,application/pdf"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        await loadTemplateResumeFile(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ) : (
                  <div className="v2-a4-upload-success" role="status">
                    <CheckCircle2 size={48} />
                    <h4>Resume Uploaded Successfully!</h4>
                    <p>File: {templateDialog.uploadedFileName}</p>
                    <p>
                      Your resume has been converted and is ready for editing.
                    </p>
                  </div>
                )}
                {templateDialog.uploadError && (
                  <div className="v2-submit-safety-note" role="alert">
                    {templateDialog.uploadError}
                  </div>
                )}
              </div>
            )}
            {templateDialog.step === 2 && (
              <div className="v2-template-step v2-template-clone-step">
                <header>
                  <h4>Edit Your Resume</h4>
                  <p>
                    Review and edit your resume content while previewing the
                    final layout.
                  </p>
                </header>
                <div
                  className="v2-template-view-tabs"
                  aria-label="Resume editor view"
                >
                  {[
                    ["split", "Split", Columns],
                    ["code", "Code", Code],
                    ["preview", "Preview", LayoutTemplate],
                  ].map(([view, label, Icon]) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={templateDialog.editorView === view}
                      className={
                        templateDialog.editorView === view ? "active" : ""
                      }
                      onClick={() =>
                        setTemplateDialog({
                          ...templateDialog,
                          editorView: view,
                        })
                      }
                    >
                      <Icon size={16} /> {label}
                    </button>
                  ))}
                </div>
                <div
                  className={`v2-template-editor-workspace ${templateDialog.editorView}`}
                >
                  {templateDialog.editorView !== "preview" && (
                    <label className="v2-template-code-editor">
                      <span>Content</span>
                      <textarea
                        name="ats-template-cloned-resume"
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
                    </label>
                  )}
                  {templateDialog.editorView !== "code" && (
                    <section className="v2-template-live-preview">
                      <b>Preview</b>
                      <iframe
                        title="Resume Preview"
                        sandbox=""
                        srcDoc={resumeEditorPreviewDocument(
                          templateDialog.editedResume,
                        )}
                      />
                    </section>
                  )}
                </div>
              </div>
            )}
            {templateDialog.step === 3 && (
              <div className="v2-template-step v2-template-experience-step">
                <header>
                  <h4>Add Additional Experience</h4>
                  <p>
                    Add experiences, skills, or achievements not already in your
                    uploaded resume. JobHuntr never invents details, and leaving
                    this blank keeps your resume unchanged.
                  </p>
                </header>
                <label className="v2-template-experience-editor">
                  <span>
                    <b>Additional Experience &amp; Skills</b>
                    <small>
                      {templateDialog.additionalExperience.length.toLocaleString()}
                      /2,000 characters
                    </small>
                  </span>
                  <textarea
                    name="ats-template-additional-experience"
                    aria-label="Additional experience and skills"
                    maxLength={2000}
                    value={templateDialog.additionalExperience}
                    onChange={(event) =>
                      setTemplateDialog({
                        ...templateDialog,
                        additionalExperience: event.target.value,
                      })
                    }
                    placeholder={
                      "Examples:\n• Freelance projects and consulting work\n• Volunteer experiences and leadership roles\n• Additional certifications or training\n• Side projects and personal initiatives\n• Awards, publications, or speaking engagements\n• Technical skills not mentioned in your resume\n• Languages and proficiency levels"
                    }
                  />
                </label>
              </div>
            )}
            {templateDialog.step === 4 && (
              <div className="v2-template-step v2-template-job-step">
                <header>
                  <h4>Job Information</h4>
                  <p>
                    Provide job details to test how well your resume matches a
                    specific position.
                  </p>
                </header>
                <label className="v2-template-tracked-job">
                  Use a tracked job
                  <select
                    name="ats-template-test-job"
                    aria-label="ATS template test job"
                    value={templateDialog.testJobId}
                    onChange={(event) => {
                      const selectedJob = state.jobs.find(
                        (job) => job.id === event.target.value,
                      );
                      setTemplateDialog({
                        ...templateDialog,
                        testJobId: event.target.value,
                        jobDescription:
                          selectedJob?.description ||
                          templateDialog.jobDescription,
                      });
                    }}
                  >
                    <option value="">Choose a tracked job (optional)</option>
                    {state.jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} · {job.company}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="v2-template-job-description">
                  <span>
                    <b>Job Description</b>
                    <a
                      href="https://www.linkedin.com/jobs/search"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={12} /> Find Jobs
                    </a>
                  </span>
                  <small>
                    Paste the full description so the test uses the exact
                    requirements.
                    <em>
                      {templateDialog.jobDescription.length.toLocaleString()}
                      /5,000 characters
                    </em>
                  </small>
                  <textarea
                    name="ats-template-job-description"
                    aria-label="ATS template job description"
                    maxLength={5000}
                    value={templateDialog.jobDescription}
                    onChange={(event) =>
                      setTemplateDialog({
                        ...templateDialog,
                        jobDescription: event.target.value,
                      })
                    }
                    placeholder={
                      "Paste the complete job description here, including:\n• Job title and company\n• Required qualifications and skills\n• Job responsibilities and duties\n• Preferred experience and education\n• Any specific requirements or keywords"
                    }
                  />
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
                <header>
                  <h4>ATS Optimization Complete</h4>
                  <p>
                    Review the original and ATS-ready versions before completing
                    your reusable template.
                  </p>
                </header>
                <div className="v2-template-score-comparison">
                  <div>
                    <strong>
                      {templateDialog.initialScoreResult?.score ?? 0}
                    </strong>
                    <span>Original ATS score</span>
                  </div>
                  <i aria-hidden="true">→</i>
                  <div className="optimized">
                    <strong>{templateDialog.scoreResult?.score ?? 0}</strong>
                    <span>ATS-ready score</span>
                  </div>
                  <b>
                    {Math.max(
                      0,
                      (templateDialog.scoreResult?.score ?? 0) -
                        (templateDialog.initialScoreResult?.score ?? 0),
                    )}
                    -point improvement
                  </b>
                </div>
                <div className="v2-template-resume-comparison">
                  <section>
                    <b>Original Resume</b>
                    <iframe
                      title="Original Resume Preview"
                      sandbox=""
                      srcDoc={resumeEditorPreviewDocument(
                        templateDialog.originalResume,
                      )}
                    />
                  </section>
                  <section>
                    <b>ATS-Ready Resume</b>
                    <iframe
                      title="ATS-Ready Resume Preview"
                      sandbox=""
                      srcDoc={resumeEditorPreviewDocument(
                        templateDialog.optimizedResume,
                      )}
                    />
                  </section>
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
                className="secondary"
                disabled={templateDialogBusy}
                onClick={() =>
                  templateDialog.step === 1
                    ? closeTemplateDialog()
                    : setTemplateDialog({
                        ...templateDialog,
                        step: templateDialog.step - 1,
                      })
                }
              >
                {templateDialog.step === 1 ? (
                  "Cancel"
                ) : (
                  <>
                    <ChevronLeft size={16} /> Previous
                  </>
                )}
              </button>
              {templateDialog.step < 5 ? (
                <button
                  disabled={
                    templateDialogBusy ||
                    (templateDialog.step === 1 &&
                      (!templateDialog.name.trim() ||
                        !templateDialog.originalResume.trim() ||
                        templateDialog.extractingFile)) ||
                    (templateDialog.step === 2 &&
                      !templateDialog.editedResume.trim()) ||
                    (templateDialog.step === 4 &&
                      !templateDialog.jobDescription.trim())
                  }
                  onClick={advanceTemplateWizard}
                >
                  {templateDialog.scoring ? (
                    "Scoring…"
                  ) : (
                    <>
                      Next <ChevronRight size={16} />
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled={templateDialogBusy || !templateDialog.name.trim()}
                  aria-busy={savingTemplate}
                  onClick={saveTemplate}
                >
                  {savingTemplate ? "Saving template…" : "Complete Template"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
const outreachDraftDigest = (draft) =>
  draft
    ? JSON.stringify({
        id: draft.id,
        subject: draft.subject || "",
        body: draft.body || "",
        status: draft.status || "draft",
      })
    : "";
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
  const [collectOpen, setCollectOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteContact, setDeleteContact] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const connectingRef = useRef(false);
  const collectingRef = useRef(false);
  const [collectFeedback, setCollectFeedback] = useState("");
  const collectCloseRef = useRef(null);
  const connectCloseRef = useRef(null);
  const initialDraft =
    state.outreachDrafts.find((item) => item.id === selectedId) || null;
  const [draft, setDraft] = useState(initialDraft);
  const [draftBaseline, setDraftBaseline] = useState(() =>
    outreachDraftDigest(initialDraft),
  );
  const [pendingContactId, setPendingContactId] = useState("");
  const hasUnsavedOutreachDraft = Boolean(
    draft && draftBaseline && outreachDraftDigest(draft) !== draftBaseline,
  );
  useEffect(() => {
    if (!collectOpen) return undefined;
    const returnFocus = document.activeElement;
    collectCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !collectingRef.current)
        setCollectOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [collectOpen]);
  useEffect(() => {
    if (!connectOpen) return undefined;
    const returnFocus = document.activeElement;
    connectCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !connectingRef.current)
        setConnectOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [connectOpen]);
  const generate = async () => {
    if (collectingRef.current) return false;
    collectingRef.current = true;
    setCollecting(true);
    setCollectFeedback("");
    try {
      const created = await api("/api/outreach/draft", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      setSelectedId(created.id);
      setDraft(created);
      setDraftBaseline(outreachDraftDigest(created));
      setCollectFeedback(
        created.collectedCount
          ? `${created.collectedCount} contact${created.collectedCount === 1 ? "" : "s"} collected.`
          : "All contacts for this role are already collected.",
      );
      await reload();
      return true;
    } catch {
      // The shared API error surface leaves contact collection retryable.
      return false;
    } finally {
      collectingRef.current = false;
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
  const finishSelectingContact = (id) => {
    const next = state.outreachDrafts.find((item) => item.id === id) || null;
    setSelectedId(id);
    setDraft(next);
    setDraftBaseline(outreachDraftDigest(next));
    setPendingContactId("");
  };
  const requestSelectContact = (id) => {
    if (!id || id === selected?.id) return;
    if (hasUnsavedOutreachDraft) {
      setPendingContactId(id);
      return;
    }
    finishSelectingContact(id);
  };
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
    if (connectingRef.current || !selectedIds.size) return;
    connectingRef.current = true;
    setConnecting(true);
    try {
      await api("/api/outreach/bulk-status", {
        method: "POST",
        body: JSON.stringify({ ids: [...selectedIds], status: "sent" }),
      });
      setSelectedIds(new Set());
      setConnectOpen(false);
      setDraft(null);
      await reload();
    } catch {
      // Keep the selected contacts and confirmation open for a safe retry.
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  };
  return (
    <section className="v2-outreach-page">
      <ConfirmDialog
        open={Boolean(pendingContactId)}
        title="Discard outreach changes?"
        description="Your latest subject or message edits have not been saved. Discard them and open another contact?"
        confirmLabel="Discard Changes"
        busyLabel="Discarding…"
        onClose={() => setPendingContactId("")}
        onConfirm={() => finishSelectingContact(pendingContactId)}
      />
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
        <h1>Outreach</h1>
        <div className="inline">
          <button
            className="secondary"
            disabled={!state.jobs.length || collecting}
            onClick={() => setCollectOpen(true)}
          >
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
              name="show-connection-messages"
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
                  name={`outreach-status-${value}`}
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
              name="outreach-sort"
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
                  name={`outreach-category-${value}`}
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
          name="outreach-search"
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
              name="select-visible-outreach-contacts"
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
                    name={`select-outreach-contact-${item.id}`}
                    aria-label={`Select ${item.recipient || "hiring team"} at ${job?.company || "company"}`}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <button
                    className={selected?.id === item.id ? "selected" : ""}
                    onClick={() => requestSelectContact(item.id)}
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
              <h2>No contacts collected yet</h2>
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
                  <h2>{selected.recipient || "Hiring team"}</h2>
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
                  onSaved={(updated) =>
                    setDraftBaseline(outreachDraftDigest(updated))
                  }
                  reload={reload}
                />
              ) : (
                <div className="v2-message-hidden">
                  <ShieldCheck size={22} />
                  <h2>Connection message hidden</h2>
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
              <h2>Select a contact</h2>
              <p>
                Contact details and your personalized message will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
      {collectOpen && (
        <div
          className="v2-template-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-contacts-title"
          onKeyDown={containDialogFocus}
        >
          <button
            className="v2-template-backdrop"
            tabIndex={-1}
            aria-label="Close collect contacts dialog"
            onClick={() => {
              if (!collectingRef.current) setCollectOpen(false);
            }}
          />
          <div className="v2-template-modal-content v2-collect-modal">
            <span className="v2-connect-icon">
              <Users size={22} />
            </span>
            <h2 id="collect-contacts-title">Collect contacts</h2>
            <p>
              Choose a tracked role. JobHuntr creates a private, editable local
              contact draft without scraping or sending anything.
            </p>
            <label>
              Role for outreach
              <select
                name="outreach-role"
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
            </label>
            <div className="v2-template-modal-actions">
              <button
                ref={collectCloseRef}
                className="secondary"
                disabled={collecting}
                onClick={() => setCollectOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={!jobId || collecting}
                aria-busy={collecting}
                onClick={async () => {
                  if (await generate()) setCollectOpen(false);
                }}
              >
                {collecting ? "Collecting…" : "Collect contacts"}
              </button>
            </div>
          </div>
        </div>
      )}
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
            tabIndex={-1}
            aria-label="Close connect contacts dialog"
            onClick={() => {
              if (!connectingRef.current) setConnectOpen(false);
            }}
          />
          <div className="v2-template-modal-content v2-connect-modal">
            <span className="v2-connect-icon">
              <MessageSquare size={22} />
            </span>
            <h2 id="connect-title">
              Connect to {selectedIds.size} contact
              {selectedIds.size === 1 ? "" : "s"}
            </h2>
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
                disabled={connecting}
                onClick={() => setConnectOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={connecting}
                aria-busy={connecting}
                onClick={markSelectedOutreached}
              >
                {connecting ? "Recording…" : "Mark as outreached"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
const practiceSessionDigest = (session) =>
  session
    ? JSON.stringify({
        id: session.id,
        answers: session.answers || {},
        notes: session.notes || "",
        researchDone: session.researchDone || [],
        status: session.status || "draft",
      })
    : "";
function Coach({ state, reload }) {
  const [view, setView] = useState("chat");
  const coachComposerDraftKey = "jobhuntr-coach-composer-draft";
  const [initialCoachComposer] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(coachComposerDraftKey) || "null",
      );
      const content = String(saved?.content || "").slice(0, 10_000);
      return content.trim() ? content : "";
    } catch {
      localStorage.removeItem(coachComposerDraftKey);
      return "";
    }
  });
  const [chatInput, setChatInput] = useState(initialCoachComposer);
  const [coachComposerRestored, setCoachComposerRestored] = useState(
    Boolean(initialCoachComposer),
  );
  const [coachResponding, setCoachResponding] = useState(false);
  const [preparingSession, setPreparingSession] = useState(false);
  const [generatingOutreach, setGeneratingOutreach] = useState(false);
  const coachRespondingRef = useRef(false);
  const preparingSessionRef = useRef(false);
  const generatingOutreachRef = useRef(false);
  const [copiedMessage, setCopiedMessage] = useState(null);
  const [deleteConversationTarget, setDeleteConversationTarget] =
    useState(null);
  const coachMigrationStarted = useRef(false);
  const [conversations, setConversations] = useState(() => {
    if (state.coachConversations?.length) return state.coachConversations;
    try {
      const saved = normalizeCoachConversations(
        JSON.parse(
          localStorage.getItem("jobhuntr-coach-conversations") || "[]",
        ),
      );
      if (saved.length) return saved;
      const legacy = normalizeCoachMessages(
        JSON.parse(localStorage.getItem("jobhuntr-coach-chat") || "[]"),
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
  const initialPracticeSession = state.coachingSessions[0] || null;
  const [session, setSession] = useState(initialPracticeSession);
  const [practiceBaseline, setPracticeBaseline] = useState(() =>
    practiceSessionDigest(initialPracticeSession),
  );
  const [pendingPracticeNavigation, setPendingPracticeNavigation] =
    useState(null);
  const [draft, setDraft] = useState(state.outreachDrafts[0] || null);
  const activeConversation =
    conversations.find(({ id }) => id === activeConversationId) ||
    (activeConversationId ? conversations[0] || null : null);
  const messages = activeConversation?.messages || [];
  useEffect(() => {
    if (!chatInput.trim()) {
      localStorage.removeItem(coachComposerDraftKey);
      return;
    }
    localStorage.setItem(
      coachComposerDraftKey,
      JSON.stringify({ content: chatInput }),
    );
  }, [chatInput]);
  const hasUnsavedPractice = Boolean(
    session && practiceSessionDigest(session) !== practiceBaseline,
  );
  const finishPracticeNavigation = (navigation) => {
    setPendingPracticeNavigation(null);
    if (navigation?.type === "session") {
      const next =
        state.coachingSessions.find(
          (candidate) => candidate.id === navigation.id,
        ) || null;
      setSession(next);
      setPracticeBaseline(practiceSessionDigest(next));
      return;
    }
    if (navigation?.type === "role") {
      setJobId(navigation.id);
      setSession(null);
      setPracticeBaseline("");
      setDraft(null);
      if (view === "chat" && activeConversation) newConversation();
      return;
    }
    if (navigation?.type === "prepare") void prepare();
  };
  const requestPracticeNavigation = (navigation) => {
    if (
      preparingSessionRef.current ||
      (navigation?.type === "session" && navigation.id === session?.id)
    )
      return;
    if (hasUnsavedPractice) {
      setPendingPracticeNavigation(navigation);
      return;
    }
    finishPracticeNavigation(navigation);
  };
  const selectConversationState = (next, activeId = activeConversationId) => {
    setConversations(next);
    if (activeId) {
      setActiveConversationId(activeId);
    } else {
      setActiveConversationId(null);
    }
  };
  useEffect(() => {
    if (
      coachMigrationStarted.current ||
      state.coachConversations?.length ||
      !conversations.length
    )
      return;
    coachMigrationStarted.current = true;
    const migrate = async () => {
      const migrated = await Promise.all(
        conversations.map((conversation) =>
          api("/api/coach/conversations", {
            method: "POST",
            body: JSON.stringify({
              id: conversation.id,
              jobId: conversation.jobId || "",
              title: conversation.title || "Career coaching session",
              messages: conversation.messages || [],
            }),
          }),
        ),
      );
      setConversations(migrated);
      localStorage.removeItem("jobhuntr-coach-conversations");
      localStorage.removeItem("jobhuntr-coach-chat");
      await reload();
    };
    void migrate().catch(() => {
      // Preserve the legacy local copy and retry after a future reload rather
      // than surfacing an unhandled rejection during automatic migration.
      coachMigrationStarted.current = false;
    });
  }, [conversations, reload, state.coachConversations?.length]);
  const newConversation = () => {
    selectConversationState(conversations, null);
  };
  const openConversation = (id) => {
    const conversation = conversations.find((item) => item.id === id);
    if (
      conversation?.jobId &&
      state.jobs.some((job) => job.id === conversation.jobId)
    )
      setJobId(conversation.jobId);
    setActiveConversationId(id);
  };
  const deleteConversation = async (id) => {
    try {
      await api(`/api/coach/conversations/${id}`, { method: "DELETE" });
      const next = conversations.filter(
        (conversation) => conversation.id !== id,
      );
      const nextActive =
        id === activeConversation?.id
          ? next[0]?.id || null
          : activeConversationId;
      selectConversationState(next, nextActive);
      setDeleteConversationTarget(null);
      await reload();
    } catch (error) {
      throw error;
    }
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
    if (!(await writeClipboardText(content))) return;
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage(null), 1800);
  };
  const shareConversation = async () => {
    if (!activeConversation?.id) return;
    const url = `${window.location.origin}${window.location.pathname}#/coach?conversation=${encodeURIComponent(activeConversation.id)}`;
    if (!(await writeClipboardText(url))) return;
    setCopiedMessage("share");
    window.setTimeout(() => setCopiedMessage(null), 1800);
  };
  const prepare = async () => {
    if (preparingSessionRef.current) return;
    preparingSessionRef.current = true;
    setPreparingSession(true);
    try {
      const created = await api("/api/coach/prepare", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      setSession(created);
      setPracticeBaseline(practiceSessionDigest(created));
      await reload();
    } catch {
      // Preserve the selected role so practice-plan creation can be retried.
    } finally {
      preparingSessionRef.current = false;
      setPreparingSession(false);
    }
  };
  const generateOutreach = async () => {
    if (generatingOutreachRef.current) return;
    generatingOutreachRef.current = true;
    setGeneratingOutreach(true);
    try {
      const created = await api("/api/outreach/draft", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      setDraft(created);
      await reload();
    } catch {
      // Preserve the selected role so outreach can be retried.
    } finally {
      generatingOutreachRef.current = false;
      setGeneratingOutreach(false);
    }
  };
  const sendCoachMessage = async (message = chatInput) => {
    const prompt = message.trim();
    if (!prompt || coachRespondingRef.current) return;
    coachRespondingRef.current = true;
    setCoachResponding(true);
    try {
      const { response: answer } = await api("/api/coach/respond", {
        method: "POST",
        body: JSON.stringify({ prompt, jobId }),
      });
      const nextMessages = [
        ...messages,
        { role: "user", content: prompt },
        { role: "assistant", content: answer },
      ];
      const payload = {
        jobId,
        title:
          activeConversation?.title ||
          (prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt),
        messages: nextMessages,
      };
      const updated = await api(
        activeConversation
          ? `/api/coach/conversations/${activeConversation.id}`
          : "/api/coach/conversations",
        {
          method: activeConversation ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      const id = updated.id;
      const nextConversations = activeConversation
        ? conversations.map((conversation) =>
            conversation.id === id ? updated : conversation,
          )
        : [updated, ...conversations];
      selectConversationState(nextConversations, id);
      setChatInput("");
      setCoachComposerRestored(false);
      await reload();
    } catch {
      // Keep the unsent prompt in the composer for a safe retry.
    } finally {
      coachRespondingRef.current = false;
      setCoachResponding(false);
    }
  };
  return (
    <section className="coach-page">
      <ConfirmDialog
        open={Boolean(pendingPracticeNavigation)}
        title="Discard practice changes?"
        description="Your latest interview answers, checklist progress, or notes have not been saved. Discard them and continue?"
        confirmLabel="Discard Changes"
        busyLabel="Discarding…"
        onClose={() => setPendingPracticeNavigation(null)}
        onConfirm={() => finishPracticeNavigation(pendingPracticeNavigation)}
      />
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
            Local Career Coach
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
          name="coaching-role"
          aria-label="Coaching role"
          value={jobId}
          onChange={(e) =>
            requestPracticeNavigation({ type: "role", id: e.target.value })
          }
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
                  <h2>Hi, I'm your Career Coach!</h2>
                  <p>
                    I&apos;m your private, on-device career planning assistant.
                    I use transparent, profile-based coaching prompts—not a
                    hosted AI service—to help sharpen your story, prepare for
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
                name="career-coach-message"
                aria-label="Message Career Coach"
                value={chatInput}
                onChange={(event) => {
                  setChatInput(event.target.value);
                  setCoachComposerRestored(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendCoachMessage();
                  }
                }}
                placeholder="Ask about your job search, interviews, or next career move…"
              />
              <button
                disabled={!chatInput.trim() || coachResponding}
                aria-busy={coachResponding}
                onClick={() => sendCoachMessage()}
              >
                {coachResponding ? "Thinking locally…" : "Get Started"}{" "}
                <ChevronRight size={17} />
              </button>
              {coachComposerRestored && (
                <small className="v2-draft-restored" role="status">
                  Unsent coaching prompt restored.
                </small>
              )}
            </div>
            <small className="v2-coach-disclaimer">
              Suggestions are generated locally from your saved profile and
              role. This is not generative AI or licensed career counseling;
              review important decisions with a professional.
            </small>
          </div>
        </div>
      )}
      {view === "practice" && (
        <div className="coach-layout">
          <div className="card coach-sidebar">
            <h3>Interview sessions</h3>
            <button
              disabled={preparingSession}
              aria-busy={preparingSession}
              onClick={() => requestPracticeNavigation({ type: "prepare" })}
            >
              <MessageSquare size={16} />{" "}
              {preparingSession ? "Preparing…" : "New role-specific plan"}
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
                  onClick={() =>
                    requestPracticeNavigation({ type: "session", id: item.id })
                  }
                >
                  <b>{job?.company || "Deleted role"}</b>
                  <span>{job?.title}</span>
                  <small>
                    {item.status} ·{" "}
                    {formatCalendarDate(item.updatedAt || item.createdAt)}
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
                onSaved={(updated) =>
                  setPracticeBaseline(practiceSessionDigest(updated))
                }
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
            <button
              disabled={generatingOutreach}
              aria-busy={generatingOutreach}
              onClick={generateOutreach}
            >
              <Sparkles size={16} />{" "}
              {generatingOutreach ? "Drafting…" : "Draft for selected role"}
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
                    {formatCalendarDate(item.updatedAt || item.createdAt)}
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
function PracticeSession({ session, setSession, onSaved, state, reload }) {
  const [savingPractice, setSavingPractice] = useState(false);
  const savingPracticeRef = useRef(false);
  const job = state.jobs.find((x) => x.id === session.jobId);
  const stories = (session.matchedStoryIds || [])
    .map((id) => state.careerStories.find((x) => x.id === id))
    .filter(Boolean);
  const save = async (status = session.status) => {
    if (savingPracticeRef.current) return;
    savingPracticeRef.current = true;
    setSavingPractice(true);
    try {
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
      onSaved(updated);
      await reload();
    } catch {
      // Keep answers and notes in the editor so saving can be retried.
    } finally {
      savingPracticeRef.current = false;
      setSavingPractice(false);
    }
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
            name={`practice-answer-${index + 1}`}
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
            name={`research-check-${item}`}
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
        name="practice-private-notes"
        value={session.notes || ""}
        onChange={(e) => setSession({ ...session, notes: e.target.value })}
        placeholder="Questions to ask, interviewer names, follow-up notes…"
      />
      <div className="inline">
        <button
          disabled={savingPractice}
          aria-busy={savingPractice}
          onClick={() => save("in-progress")}
        >
          <Save size={16} /> {savingPractice ? "Saving…" : "Save progress"}
        </button>
        <button
          className="success"
          disabled={savingPractice}
          onClick={() => save("completed")}
        >
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
  const [storyBaseline, setStoryBaseline] = useState(() =>
    JSON.stringify(empty),
  );
  const [pendingStoryId, setPendingStoryId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [savingStory, setSavingStory] = useState(false);
  const savingStoryRef = useRef(false);
  const storyDigest = (value) =>
    JSON.stringify({
      title: value.title || "",
      situation: value.situation || "",
      task: value.task || "",
      action: value.action || "",
      result: value.result || "",
      skills: value.skills || "",
    });
  const hasUnsavedStory = storyDigest(form) !== storyBaseline;
  const finishStoryNavigation = (id) => {
    const story = stories.find((item) => item.id === id);
    const next = story
      ? { ...story, skills: (story.skills || []).join(", ") }
      : empty;
    setSelected(story?.id || null);
    setForm(next);
    setStoryBaseline(storyDigest(next));
    setPendingStoryId("");
  };
  const requestStoryNavigation = (id = "new") => {
    if (savingStoryRef.current || id === selected) return;
    if (hasUnsavedStory) {
      setPendingStoryId(id);
      return;
    }
    finishStoryNavigation(id);
  };
  const save = async () => {
    if (savingStoryRef.current) return;
    savingStoryRef.current = true;
    setSavingStory(true);
    const body = {
      ...form,
      skills: form.skills
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    try {
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
      setStoryBaseline(storyDigest(empty));
      await reload();
    } catch {
      // Keep the STAR evidence in the form so saving can be retried.
    } finally {
      savingStoryRef.current = false;
      setSavingStory(false);
    }
  };
  return (
    <div className="story-layout">
      <ConfirmDialog
        open={Boolean(pendingStoryId)}
        title="Discard STAR story changes?"
        description="Your latest evidence edits have not been saved. Discard them and continue?"
        confirmLabel="Discard Changes"
        busyLabel="Discarding…"
        onClose={() => setPendingStoryId("")}
        onConfirm={() => finishStoryNavigation(pendingStoryId)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete STAR story?"
        description={`“${deleteTarget?.title || "This story"}” will be permanently removed from your evidence library and detached from interview practice sessions.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await api(`/api/career-stories/${deleteTarget.id}`, {
            method: "DELETE",
          });
          if (selected === deleteTarget.id) {
            setSelected(null);
            setForm(empty);
            setStoryBaseline(storyDigest(empty));
          }
          setDeleteTarget(null);
          await reload();
        }}
      />
      <div className="card">
        <div className="row">
          <h3>{selected ? "Edit STAR story" : "Add STAR story"}</h3>
          {selected && (
            <button
              className="text-button"
              disabled={savingStory}
              onClick={() => requestStoryNavigation()}
            >
              New
            </button>
          )}
        </div>
        <label>
          Story title
          <input
            name="career-story-title"
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
              name={`career-story-${key}`}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Skills, comma-separated
          <input
            name="career-story-skills"
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
          />
        </label>
        <button
          disabled={savingStory || !form.title.trim()}
          aria-busy={savingStory}
          onClick={save}
        >
          <Save size={16} />{" "}
          {savingStory ? "Saving…" : selected ? "Save changes" : "Save story"}
        </button>
      </div>
      <div className="card">
        <h3>Your evidence library · {stories.length}</h3>
        {stories.length ? (
          stories.map((story) => (
            <div className="story-card" key={story.id}>
              <button
                disabled={savingStory}
                onClick={() => requestStoryNavigation(story.id)}
              >
                <b>{story.title}</b>
                <span>{(story.skills || []).join(" · ")}</span>
                <p>
                  {story.result || story.action || "Add a measurable result."}
                </p>
              </button>
              <button
                className="danger"
                disabled={savingStory}
                aria-label={`Delete STAR story ${story.title}`}
                onClick={() => setDeleteTarget(story)}
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
function OutreachEditor({ draft, setDraft, onSaved, reload }) {
  const [savingDraft, setSavingDraft] = useState(false);
  const savingDraftRef = useRef(false);
  const save = async (status = draft.status || "draft") => {
    if (savingDraftRef.current) return;
    savingDraftRef.current = true;
    setSavingDraft(true);
    try {
      const updated = await api(`/api/outreach/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          subject: draft.subject,
          body: draft.body,
          status,
        }),
      });
      setDraft(updated);
      onSaved(updated);
      await reload();
    } catch {
      // Preserve the edited message and status so saving can be retried.
    } finally {
      savingDraftRef.current = false;
      setSavingDraft(false);
    }
  };
  return (
    <div>
      <div className="row">
        <h3>Edit outreach</h3>
        <select
          name={`outreach-status-${draft.id}`}
          aria-label="Outreach status"
          disabled={savingDraft}
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
          name={`outreach-subject-${draft.id}`}
          disabled={savingDraft}
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
        />
      </label>
      <label>
        Message
        <textarea
          name={`outreach-message-${draft.id}`}
          className="letter"
          disabled={savingDraft}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </label>
      <button
        disabled={savingDraft}
        aria-busy={savingDraft}
        onClick={() => save()}
      >
        <Save size={16} /> {savingDraft ? "Saving…" : "Save locally"}
      </button>
      <p className="hint">
        Copy this draft into your preferred service manually. No message is sent
        by JobHuntr.
      </p>
    </div>
  );
}
const LOCAL_GIG_CAMPAIGNS = [
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
];
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
  const gigDraftKey = "jobhuntr-new-gig-draft";
  const [initialGigDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(gigDraftKey) || "null");
      if (!saved) return null;
      return {
        ...empty,
        client: String(saved.client || "").slice(0, 200),
        title: String(saved.title || "").slice(0, 300),
        source: String(saved.source || "Manual").slice(0, 100),
        url: String(saved.url || "").slice(0, 2_000),
        budget: String(saved.budget || "").slice(0, 20),
        dueDate: String(saved.dueDate || "").slice(0, 10),
        description: String(saved.description || "").slice(0, 10_000),
      };
    } catch {
      localStorage.removeItem(gigDraftKey);
      return null;
    }
  });
  const [form, setForm] = useState(initialGigDraft || empty);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(Boolean(initialGigDraft));
  const [gigDraftRestored, setGigDraftRestored] = useState(
    Boolean(initialGigDraft),
  );
  const gigPitchDraftKey = "jobhuntr-gig-application-pitch-draft";
  const [initialPitchDraft] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(gigPitchDraftKey) || "null",
      );
      const campaign = LOCAL_GIG_CAMPAIGNS.find(
        (item) => item.title === saved?.title,
      );
      if (!campaign || !String(saved?.proposal || "").trim()) return null;
      return {
        campaign,
        proposal: String(saved.proposal).slice(0, 10_000),
      };
    } catch {
      localStorage.removeItem(gigPitchDraftKey);
      return null;
    }
  });
  const [campaignPreview, setCampaignPreview] = useState(
    initialPitchDraft?.campaign || null,
  );
  const [campaignProposal, setCampaignProposal] = useState(
    initialPitchDraft?.proposal || "",
  );
  const [campaignDraftRestored, setCampaignDraftRestored] = useState(
    Boolean(initialPitchDraft),
  );
  const [discardCampaignOpen, setDiscardCampaignOpen] = useState(false);
  const [gigQuery, setGigQuery] = useState("");
  const [myGigQuery, setMyGigQuery] = useState("");
  const [myView, setMyView] = useState("table");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionFeedback, setActionFeedback] = useState("");
  const [savingGig, setSavingGig] = useState(false);
  const [applyingGig, setApplyingGig] = useState(false);
  const savingGigRef = useRef(false);
  const applyingGigRef = useRef(false);
  const gigMutationQueuesRef = useRef(new Map());
  const [patchingGigIds, setPatchingGigIds] = useState(() => new Set());
  const gigCloseRef = useRef(null);
  const campaignCloseRef = useRef(null);
  const gig = state.gigs.find((item) => item.id === selected);
  const gigDetailsBusy = Boolean(gig && patchingGigIds.has(gig.id));
  const gigDetailsBusyRef = useRef(gigDetailsBusy);
  useEffect(() => {
    gigDetailsBusyRef.current = gigDetailsBusy;
  }, [gigDetailsBusy]);
  const closeGigDetails = useCallback(() => {
    if (gigDetailsBusyRef.current) return;
    setSelected(null);
  }, []);
  useEffect(() => {
    const hasDraft = Boolean(
      form.client.trim() ||
      form.title.trim() ||
      form.url.trim() ||
      Number(form.budget) ||
      form.dueDate ||
      form.description.trim() ||
      form.source !== "Manual",
    );
    if (!hasDraft) {
      localStorage.removeItem(gigDraftKey);
      return;
    }
    localStorage.setItem(gigDraftKey, JSON.stringify(form));
  }, [form]);
  useEffect(() => {
    if (!campaignPreview || !campaignProposal.trim()) {
      localStorage.removeItem(gigPitchDraftKey);
      return;
    }
    localStorage.setItem(
      gigPitchDraftKey,
      JSON.stringify({
        title: campaignPreview.title,
        proposal: campaignProposal,
      }),
    );
  }, [campaignPreview, campaignProposal]);
  const finishClosingCampaign = useCallback(() => {
    setCampaignPreview(null);
    setCampaignProposal("");
    setCampaignDraftRestored(false);
    setDiscardCampaignOpen(false);
    localStorage.removeItem("jobhuntr-gig-application-pitch-draft");
  }, []);
  const requestCloseCampaign = useCallback(() => {
    if (applyingGigRef.current || discardCampaignOpen) return;
    if (campaignProposal.trim()) {
      setDiscardCampaignOpen(true);
      return;
    }
    finishClosingCampaign();
  }, [campaignProposal, discardCampaignOpen, finishClosingCampaign]);
  const requestCloseCampaignRef = useRef(requestCloseCampaign);
  useEffect(() => {
    requestCloseCampaignRef.current = requestCloseCampaign;
  }, [requestCloseCampaign]);
  const money = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  const save = async () => {
    if (savingGigRef.current) return;
    savingGigRef.current = true;
    setSavingGig(true);
    try {
      const created = await api("/api/gigs", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSelected(created.id);
      setForm(empty);
      setShowForm(false);
      setGigDraftRestored(false);
      localStorage.removeItem(gigDraftKey);
      await reload();
    } catch {
      // Keep the opportunity form intact so creation can be retried.
    } finally {
      savingGigRef.current = false;
      setSavingGig(false);
    }
  };
  const patch = (id, body) => {
    if (!id) return Promise.resolve(false);
    const previous = gigMutationQueuesRef.current.get(id) || Promise.resolve();
    if (selected === id) gigDetailsBusyRef.current = true;
    setPatchingGigIds((current) => new Set(current).add(id));
    const operation = previous
      .catch(() => false)
      .then(async () => {
        try {
          await api(`/api/gigs/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          await reload();
          return true;
        } catch {
          return false;
        }
      });
    gigMutationQueuesRef.current.set(id, operation);
    return operation.finally(() => {
      if (gigMutationQueuesRef.current.get(id) !== operation) return;
      gigMutationQueuesRef.current.delete(id);
      if (selected === id) gigDetailsBusyRef.current = false;
      setPatchingGigIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    });
  };
  const advanceGig = async (id, status, message) => {
    if (await patch(id, { status })) setActionFeedback(message);
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
  const availableGigs = LOCAL_GIG_CAMPAIGNS.filter((item) =>
    `${item.title} ${item.client} ${item.description}`
      .toLowerCase()
      .includes(gigQuery.toLowerCase()),
  );
  const applyToGig = async (item) => {
    if (!item || applyingGigRef.current) return;
    applyingGigRef.current = true;
    setApplyingGig(true);
    try {
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
      setCampaignDraftRestored(false);
      localStorage.removeItem(gigPitchDraftKey);
      await reload();
    } catch {
      // Keep the campaign and pitch open so submission can be retried.
    } finally {
      applyingGigRef.current = false;
      setApplyingGig(false);
    }
  };
  const visibleTrackedGigs = state.gigs.filter((item) =>
    `${item.title} ${item.client} ${item.status}`
      .toLowerCase()
      .includes(myGigQuery.toLowerCase()),
  );
  const deleteGig = async () => {
    try {
      await (gigMutationQueuesRef.current.get(deleteTarget.id) ||
        Promise.resolve());
      await api(`/api/gigs/${deleteTarget.id}`, { method: "DELETE" });
      setSelected(null);
      await reload();
    } catch (error) {
      throw error;
    }
  };
  useEffect(() => {
    if (!selected || myView !== "table") return undefined;
    const returnFocus = document.activeElement;
    gigCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !deleteTarget) closeGigDetails();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [closeGigDetails, selected, myView, deleteTarget]);
  useEffect(() => {
    if (!campaignPreview) return undefined;
    const returnFocus = document.activeElement;
    campaignCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") requestCloseCampaignRef.current();
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
        open={discardCampaignOpen}
        title="Discard application pitch?"
        description="Your pitch for this gig has not been submitted. Discard it?"
        confirmLabel="Discard Pitch"
        busyLabel="Discarding…"
        onClose={() => setDiscardCampaignOpen(false)}
        onConfirm={finishClosingCampaign}
      />
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
            name="available-gigs-search"
            aria-label="Search available gigs"
            value={gigQuery}
            onChange={(event) => setGigQuery(event.target.value)}
            placeholder="Search gigs by title, description, or partner…"
          />
          {gigQuery && (
            <button
              className="icon-btn"
              type="button"
              aria-label="Clear available gigs search"
              onClick={() => setGigQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {availableGigs.length ? (
          <div className="v2-gig-campaigns">
            {availableGigs.map((item) => (
              <article className="card" key={item.title}>
                <div className="v2-gig-campaign-head">
                  <div>
                    <h3>{item.title}</h3>
                    <small>by {item.client}</small>
                  </div>
                  <strong>{money(item.budget)}+ Cash</strong>
                </div>
                <p>{item.description}</p>
                <div className="chips">
                  {item.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setCampaignProposal("");
                    setCampaignDraftRestored(false);
                    setCampaignPreview(item);
                  }}
                >
                  Apply Now
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="v2-gig-campaign-empty" role="status">
            No gigs found matching “{gigQuery.trim()}”. Try a different search
            term.
          </div>
        )}
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
            tabIndex={-1}
            aria-label="Close gig application"
            onClick={requestCloseCampaign}
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
                name="gig-application-pitch"
                aria-label="Gig application pitch"
                disabled={applyingGig}
                value={campaignProposal}
                onChange={(event) => {
                  setCampaignProposal(event.target.value);
                  setCampaignDraftRestored(false);
                }}
                placeholder="Share relevant experience, your approach, and availability…"
              />
            </label>
            {campaignDraftRestored && (
              <p className="v2-draft-restored" role="status">
                Unsaved gig application pitch restored.
              </p>
            )}
            <div className="v2-gig-application-notice">
              <ShieldCheck size={18} />
              Your application and pitch are stored only in this local
              workspace.
            </div>
            <div className="v2-template-modal-actions">
              <button
                ref={campaignCloseRef}
                className="secondary"
                disabled={applyingGig}
                onClick={requestCloseCampaign}
              >
                Cancel
              </button>
              <button
                disabled={applyingGig}
                aria-busy={applyingGig}
                onClick={() => applyToGig(campaignPreview)}
              >
                {applyingGig ? "Submitting…" : "Submit Application"}
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
        <div className="v2-gigs-section-actions">
          <button className="secondary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Add gig
          </button>
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
            <button
              className="text-button"
              disabled={savingGig}
              onClick={() => setShowForm(false)}
            >
              Close
            </button>
          </div>
          {gigDraftRestored && (
            <p className="v2-draft-restored" role="status">
              Unsaved gig opportunity draft restored.
            </p>
          )}
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
                  name={`new-gig-${key}`}
                  disabled={savingGig}
                  type={
                    key === "budget"
                      ? "number"
                      : key === "dueDate"
                        ? "date"
                        : "text"
                  }
                  value={form[key]}
                  onChange={(e) => {
                    setForm({ ...form, [key]: e.target.value });
                    setGigDraftRestored(false);
                  }}
                />
              </label>
            ))}
          </div>
          <label>
            Description
            <textarea
              name="new-gig-description"
              disabled={savingGig}
              value={form.description}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
                setGigDraftRestored(false);
              }}
            />
          </label>
          <button
            disabled={savingGig || !form.client.trim() || !form.title.trim()}
            aria-busy={savingGig}
            onClick={save}
          >
            {savingGig ? "Saving…" : "Save gig"}
          </button>
        </div>
      )}
      <div className="searchbox v2-my-gig-search">
        <Search size={16} />
        <input
          name="my-gigs-search"
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
              <time>{formatCalendarDate(item.createdAt)}</time>
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
                      draggable={!patchingGigIds.has(item.id)}
                      disabled={patchingGigIds.has(item.id)}
                      aria-busy={patchingGigIds.has(item.id)}
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
                          {formatCalendarDate(
                            `${item.dueDate}T12:00:00`,
                            "Not set",
                          )}
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
                  disabled={gigDetailsBusy}
                  onClick={closeGigDetails}
                >
                  ×
                </button>
              </div>
              <h2>{gig.title}</h2>
              <p className="muted">
                {gig.client} · {gig.source}
              </p>
              <select
                name="gig-stage"
                aria-label="Gig stage"
                disabled={patchingGigIds.has(gig.id)}
                aria-busy={patchingGigIds.has(gig.id)}
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
                    name="gig-budget"
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
                    name="gig-earned"
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
                  name="gig-deadline"
                  type="date"
                  defaultValue={gig.dueDate || ""}
                  onBlur={(e) => patch(gig.id, { dueDate: e.target.value })}
                />
              </label>
              <label>
                Description
                <textarea
                  name="gig-description"
                  defaultValue={gig.description}
                  onBlur={(e) => patch(gig.id, { description: e.target.value })}
                />
              </label>
              <label>
                Proposal / pitch
                <textarea
                  name="gig-proposal"
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
                    <small>{formatDateTime(event.at)}</small>
                  </p>
                ))}
              </div>
              <button
                className="danger"
                disabled={patchingGigIds.has(gig.id)}
                onClick={() => setDeleteTarget(gig)}
              >
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
            tabIndex={-1}
            aria-label="Close gig details"
            disabled={gigDetailsBusy}
            onClick={closeGigDetails}
          />
          <div className="v2-template-modal-content v2-gig-detail-modal">
            <div className="row">
              <span className={`pill ${gig.status}`}>{gig.status}</span>
              <button
                ref={gigCloseRef}
                className="drawer-close"
                aria-label="Close gig details"
                disabled={gigDetailsBusy}
                onClick={closeGigDetails}
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
                name="gig-application-status"
                aria-label="Gig application status"
                disabled={patchingGigIds.has(gig.id)}
                aria-busy={patchingGigIds.has(gig.id)}
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
                  disabled={patchingGigIds.has(gig.id)}
                  aria-busy={patchingGigIds.has(gig.id)}
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
                  disabled={patchingGigIds.has(gig.id)}
                  aria-busy={patchingGigIds.has(gig.id)}
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
                  name="gig-potential-earning"
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
                  name="gig-actual-earning"
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
                name="gig-application-deadline"
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
                name="gig-delivery-notes"
                className="gig-proposal"
                defaultValue={gig.proposal}
                onBlur={(event) =>
                  patch(gig.id, { proposal: event.target.value })
                }
              />
            </label>
            <div className="v2-gig-modal-footer">
              <button
                className="danger"
                disabled={patchingGigIds.has(gig.id)}
                onClick={() => setDeleteTarget(gig)}
              >
                Close application
              </button>
              <button
                className="secondary"
                disabled={gigDetailsBusy}
                onClick={closeGigDetails}
              >
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
  const auditDraftKey = "jobhuntr-profile-audit-draft";
  const auditDefaults = {
    profileUrl: "",
    targetContext: "",
    headline: state.profile.headline || "",
    about: "",
    experience: state.profile.resumeText || "",
    skills: (state.profile.skills || []).join(", "),
  };
  const [initialAuditDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(auditDraftKey) || "null");
      if (!saved) return null;
      return {
        profileUrl: String(saved.profileUrl || "").slice(0, 2_000),
        targetContext: String(saved.targetContext || "").slice(0, 20_000),
        headline: String(saved.headline || "").slice(0, 1_000),
        about: String(saved.about || "").slice(0, 20_000),
        experience: String(saved.experience || "").slice(0, 50_000),
        skills: String(saved.skills || "").slice(0, 5_000),
      };
    } catch {
      localStorage.removeItem(auditDraftKey);
      return null;
    }
  });
  const [profileUrl, setProfileUrl] = useState(
    initialAuditDraft?.profileUrl || "",
  );
  const [expanded, setExpanded] = useState(() =>
    Boolean(
      initialAuditDraft?.about ||
      initialAuditDraft?.experience ||
      initialAuditDraft?.skills,
    ),
  );
  const [contextExpanded, setContextExpanded] = useState(
    Boolean(initialAuditDraft?.targetContext),
  );
  const [form, setForm] = useState(initialAuditDraft || auditDefaults);
  const [auditDraftRestored, setAuditDraftRestored] = useState(
    Boolean(initialAuditDraft),
  );
  const [audit, setAudit] = useState(state.profileAudits[0] || null);
  const [deleteAudit, setDeleteAudit] = useState(null);
  const [running, setRunning] = useState(false);
  const runningAuditRef = useRef(false);
  const profileRevision = useRef(0);
  const persistAuditDraft = (nextProfileUrl, nextForm) => {
    localStorage.setItem(
      auditDraftKey,
      JSON.stringify({ ...nextForm, profileUrl: nextProfileUrl }),
    );
  };
  const editProfileUrl = (value) => {
    profileRevision.current += 1;
    setProfileUrl(value);
    setAuditDraftRestored(false);
    persistAuditDraft(value, form);
    setAudit(null);
  };
  const editAuditForm = (next) => {
    profileRevision.current += 1;
    setForm(next);
    setAuditDraftRestored(false);
    persistAuditDraft(profileUrl, next);
    setAudit(null);
  };
  const profileUrlValid =
    !profileUrl.trim() ||
    /^https:\/\/(www\.)?linkedin\.com\/(in|pub)\/[^/?#]+/i.test(
      profileUrl.trim(),
    );
  const run = async () => {
    if (runningAuditRef.current) return;
    runningAuditRef.current = true;
    const auditRevision = profileRevision.current;
    setRunning(true);
    try {
      const result = await api("/api/profile-audits", {
        method: "POST",
        body: JSON.stringify({ ...form, profileUrl }),
      });
      if (profileRevision.current === auditRevision) {
        setAudit(result);
        setAuditDraftRestored(false);
        localStorage.removeItem(auditDraftKey);
      }
      await reload();
    } catch {
      // Preserve the pasted profile content so the audit can be retried.
    } finally {
      runningAuditRef.current = false;
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
          <h1>LinkedIn Profile Audit</h1>
          <p>
            Review your profile positioning and receive comprehensive,
            evidence-based feedback.
          </p>
        </div>
      </div>
      <div className="v2-audit-url">
        <input
          name="linkedin-profile-url"
          aria-label="LinkedIn profile URL"
          value={profileUrl}
          onChange={(e) => editProfileUrl(e.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !running &&
              profileUrl.trim() &&
              form.headline.trim() &&
              profileUrlValid
            )
              run();
          }}
          placeholder="https://www.linkedin.com/in/username"
          inputMode="url"
          aria-invalid={!profileUrlValid}
        />
        <button
          disabled={
            running ||
            !profileUrl.trim() ||
            !form.headline.trim() ||
            !profileUrlValid
          }
          aria-busy={running}
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
            name="linkedin-audit-context"
            value={form.targetContext}
            onChange={(event) =>
              editAuditForm({ ...form, targetContext: event.target.value })
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
      {auditDraftRestored && (
        <p className="v2-draft-restored" role="status">
          Private LinkedIn audit draft restored.
        </p>
      )}
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
                name="linkedin-headline"
                value={form.headline}
                maxLength="1000"
                onChange={(e) =>
                  editAuditForm({ ...form, headline: e.target.value })
                }
                placeholder="Product engineer | AI workflows | Shipped 0→1 products"
              />
            </label>
            <small className="v2-field-count">
              {form.headline.length} characters
            </small>
            <label>
              About section
              <textarea
                name="linkedin-about"
                value={form.about}
                onChange={(e) =>
                  editAuditForm({ ...form, about: e.target.value })
                }
                placeholder="Your positioning, evidence, motivation, and call to action…"
              />
            </label>
            <small className="v2-field-count">
              {form.about.trim().split(/\s+/).filter(Boolean).length} words
            </small>
            <label>
              Experience highlights
              <textarea
                name="linkedin-experience"
                className="audit-experience"
                value={form.experience}
                onChange={(e) =>
                  editAuditForm({ ...form, experience: e.target.value })
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
                name="linkedin-skills"
                value={form.skills}
                onChange={(e) =>
                  editAuditForm({ ...form, skills: e.target.value })
                }
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
              <h3 role="heading" aria-level="2">
                Analyzing your profile…
              </h3>
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
              <h3 role="heading" aria-level="2">
                Get an inspectable score
              </h3>
              <p>
                No generative AI or hidden rubric. Every section score maps to
                visible evidence.
              </p>
            </div>
          )}
          <div className="card">
            <h3 role="heading" aria-level="2">
              Audit history · {state.profileAudits.length}
            </h3>
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
                      profileRevision.current += 1;
                      localStorage.removeItem(auditDraftKey);
                      setAuditDraftRestored(false);
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
                    <span>{formatDateTime(item.createdAt)}</span>
                    <small>{item.suggestions.length} recommendation(s)</small>
                  </button>
                  <button
                    className="danger"
                    aria-label={`Delete profile audit from ${formatCalendarDate(item.createdAt)}`}
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
  const profileResumeReady = isUsableResumeText(state.profile.resumeText);
  const [newRunDraft] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("jobhuntr-new-run-draft") || "null",
      );
      if (!saved) return null;
      return {
        runName: String(saved.runName || "").slice(0, 300),
        origin: String(saved.origin || "infinite").slice(0, 50),
        q: String(saved.q || "").slice(0, 500),
        location: String(saved.location || "").slice(0, 500),
        minFit: Math.min(95, Math.max(30, Number(saved.minFit) || 60)),
        maxResults: [5, 10, 25, 50].includes(Number(saved.maxResults))
          ? Number(saved.maxResults)
          : 25,
        requiredKeywords: Array.isArray(saved.requiredKeywords)
          ? saved.requiredKeywords
              .slice(0, 100)
              .map((item) => String(item).slice(0, 100))
          : [],
        excludeKeywords: Array.isArray(saved.excludeKeywords)
          ? saved.excludeKeywords
              .slice(0, 100)
              .map((item) => String(item).slice(0, 100))
          : [],
        workflows: normalizeHuntWorkflows(saved.workflows),
        optimizeResume: Boolean(saved.optimizeResume),
        intervalMinutes: [15, 60, 240, 1440].includes(
          Number(saved.intervalMinutes),
        )
          ? Number(saved.intervalMinutes)
          : 60,
      };
    } catch {
      localStorage.removeItem("jobhuntr-new-run-draft");
      return null;
    }
  });
  const defaults = {
    q: newRunDraft?.q || state.profile.targetRoles?.[0] || "Software Engineer",
    location:
      newRunDraft?.location || state.profile.preferences?.locations?.[0] || "",
    minFit: newRunDraft?.minFit ?? 60,
    maxResults: newRunDraft?.maxResults ?? 25,
    required: (newRunDraft?.requiredKeywords || []).join(", "),
    excluded: (newRunDraft?.excludeKeywords || []).join(", "),
  };
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [selectedRuns, setSelectedRuns] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("jobhuntr-infinite-workflows") || "null",
      );
      return normalizeHuntWorkflows(
        Array.isArray(newRunDraft?.workflows) && newRunDraft.workflows.length
          ? newRunDraft.workflows
          : saved,
      );
    } catch {
      return ["linkedin", "indeed"];
    }
  });
  const [optimizeResume, setOptimizeResume] = useState(
    () =>
      profileResumeReady &&
      (newRunDraft?.optimizeResume ??
        localStorage.getItem("jobhuntr-optimize-resume") === "true"),
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    newRunDraft?.intervalMinutes || state.infiniteHunt?.intervalMinutes || 60,
  );
  const [huntDraftRestored, setHuntDraftRestored] = useState(
    Boolean(newRunDraft),
  );
  const [huntDraftTouched, setHuntDraftTouched] = useState(
    Boolean(newRunDraft),
  );
  const [running, setRunning] = useState(false);
  const [stoppingInfinite, setStoppingInfinite] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const runningRef = useRef(false);
  const stoppingInfiniteRef = useRef(false);
  const previewingRef = useRef(false);
  const savingPresetRef = useRef(false);
  const [presetSaved, setPresetSaved] = useState(false);
  const [deletePreset, setDeletePreset] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusCloseRef = useRef(null);
  const latestRun = state.agentRuns[0] || null;
  const queuedSubmissions = state.submissions.filter((submission) =>
    ["draft", "ready"].includes(submission.status),
  );
  useEffect(() => {
    localStorage.setItem(
      "jobhuntr-infinite-workflows",
      JSON.stringify(selectedRuns),
    );
  }, [selectedRuns]);
  useEffect(() => {
    if (!newRunDraft) return;
    localStorage.setItem(
      "jobhuntr-optimize-resume",
      String(Boolean(newRunDraft.optimizeResume)),
    );
  }, [newRunDraft]);
  useEffect(() => {
    if (!huntDraftTouched) return;
    localStorage.setItem(
      "jobhuntr-new-run-draft",
      JSON.stringify({
        runName: newRunDraft?.runName || form.q,
        origin: newRunDraft?.origin || "infinite",
        q: form.q,
        location: form.location,
        minFit: Number(form.minFit),
        maxResults: Number(form.maxResults),
        requiredKeywords: form.required
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        excludeKeywords: form.excluded
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        workflows: selectedRuns,
        optimizeResume: profileResumeReady && optimizeResume,
        intervalMinutes: Number(intervalMinutes),
      }),
    );
  }, [
    form,
    huntDraftTouched,
    intervalMinutes,
    newRunDraft?.origin,
    newRunDraft?.runName,
    optimizeResume,
    profileResumeReady,
    selectedRuns,
  ]);
  const editHuntForm = (next) => {
    setForm(next);
    setHuntDraftTouched(true);
    setHuntDraftRestored(false);
  };
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
    optimizeResume: profileResumeReady && optimizeResume,
  });
  const loadPreset = (preset) => {
    editHuntForm({
      ...form,
      ...preset.options,
      required: (preset.options.requiredKeywords || []).join(", "),
      excluded: (preset.options.excludeKeywords || []).join(", "),
    });
    if (preset.options.workflows?.length)
      saveRunOrder(normalizeHuntWorkflows(preset.options.workflows));
    if (preset.options.optimizeResume !== undefined) {
      setOptimizeResume(Boolean(preset.options.optimizeResume));
      localStorage.setItem(
        "jobhuntr-optimize-resume",
        String(Boolean(preset.options.optimizeResume)),
      );
    }
  };
  const run = async () => {
    if (runningRef.current || stoppingInfiniteRef.current) return;
    runningRef.current = true;
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
      setHuntDraftRestored(false);
      setHuntDraftTouched(false);
      await reload();
    } catch {
      // Keep the configured run available after the shared error is shown.
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };
  const startInfiniteHunt = async () => {
    if (runningRef.current || stoppingInfiniteRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      const { run: result } = await api("/api/infinite-hunt/start-run", {
        method: "POST",
        body: JSON.stringify({
          intervalMinutes: Number(intervalMinutes),
          options: payload(),
        }),
      });
      setPreview({
        matches: result.matches,
        inspected: result.inspected,
        alreadyTracked: result.duplicates,
        options: result.options,
        added: result.added,
      });
      localStorage.removeItem("jobhuntr-new-run-draft");
      setHuntDraftRestored(false);
      setHuntDraftTouched(false);
      await reload();
    } catch {
      // One local transaction creates both schedule and initial run, so a
      // failure cannot leave a phantom Infinite Hunt schedule behind.
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };
  const stopInfiniteHunt = async () => {
    if (runningRef.current || stoppingInfiniteRef.current) return;
    stoppingInfiniteRef.current = true;
    setStoppingInfinite(true);
    try {
      await api("/api/infinite-hunt/stop", { method: "POST" });
      await reload();
    } catch {
      // Keep the active schedule visible and retryable after the shared error.
    } finally {
      stoppingInfiniteRef.current = false;
      setStoppingInfinite(false);
    }
  };
  const previewMatches = async () => {
    if (previewingRef.current) return;
    previewingRef.current = true;
    setPreviewing(true);
    try {
      setPreview(
        await api("/api/agent-runs/preview", {
          method: "POST",
          body: JSON.stringify(payload()),
        }),
      );
    } catch {
      // The shared API error surface already explains the failure. Keep the
      // rejected request from escaping the click handler as a browser error.
    } finally {
      previewingRef.current = false;
      setPreviewing(false);
    }
  };
  const savePreset = async () => {
    if (savingPresetRef.current) return;
    savingPresetRef.current = true;
    setSavingPreset(true);
    setPresetSaved(false);
    try {
      await api("/api/hunt-presets", {
        method: "POST",
        body: JSON.stringify({ ...payload(), name: form.q }),
      });
      await reload();
      setPresetSaved(true);
    } catch {
      // Keep the current hunt form available after the shared error is shown.
    } finally {
      savingPresetRef.current = false;
      setSavingPreset(false);
    }
  };
  const workflows = HUNT_WORKFLOWS;
  const saveRunOrder = (runs) => {
    setSelectedRuns(runs);
    setHuntDraftTouched(true);
    setHuntDraftRestored(false);
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
            Combine repeatable local search workflows, inspect every match, and
            prepare application packets for human review.
          </p>
        </div>
        {latestRun && (
          <button onClick={() => setStatusOpen(true)}>
            View last infinite session
          </button>
        )}
      </div>
      {queuedSubmissions.length > 0 && (
        <div className="v2-queue-banner">
          <List size={20} />
          <span>
            You have {queuedSubmissions.length} queued job
            {queuedSubmissions.length === 1 ? "" : "s"} waiting to be reviewed
          </span>
          <button className="secondary" onClick={() => setTab("queue")}>
            View Submission Queue <ChevronRight size={15} />
          </button>
        </div>
      )}
      <div className="card v2-hunt-builder">
        {huntDraftRestored && (
          <p className="v2-draft-restored" role="status">
            Unsaved Infinite Hunt configuration restored.
          </p>
        )}
        {state.infiniteHunt?.enabled && (
          <div className="v2-queue-banner v2-infinite-active" role="status">
            <CheckCircle2 size={20} />
            <span>
              Infinite Hunt is active every {state.infiniteHunt.intervalMinutes}{" "}
              minute{state.infiniteHunt.intervalMinutes === 1 ? "" : "s"}.
              <small>Recurring hunts continue while JobHuntr is running.</small>
              {state.infiniteHunt.nextRunAt && (
                <small>
                  Next run {formatDateTime(state.infiniteHunt.nextRunAt)}
                </small>
              )}
              {state.infiniteHunt.lastError && (
                <small className="v2-infinite-error" role="alert">
                  Last scheduled run failed: {state.infiniteHunt.lastError}
                </small>
              )}
            </span>
            <button
              className="secondary"
              disabled={stoppingInfinite || running}
              aria-busy={stoppingInfinite}
              onClick={stopInfiniteHunt}
            >
              {stoppingInfinite ? "Stopping…" : "Stop Infinite Hunt"}
            </button>
          </div>
        )}
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
              name="optimize-resume"
              checked={optimizeResume}
              disabled={!profileResumeReady}
              onChange={(e) => {
                setOptimizeResume(e.target.checked);
                setHuntDraftTouched(true);
                setHuntDraftRestored(false);
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
          {!profileResumeReady && (
            <div className="v2-submit-safety-note" role="alert">
              Add your real resume before generating tailored versions.{" "}
              <button className="text-button" onClick={() => setTab("resume")}>
                Open ATS Resume
              </button>
            </div>
          )}
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
                  <PlatformMark id={id} fallback={mark} />
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
                    <PlatformMark id={id} fallback={workflow[1]} />
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
                name="hunt-role-keywords"
                value={form.q}
                onChange={(e) => editHuntForm({ ...form, q: e.target.value })}
                placeholder="Product engineer"
              />
            </label>
            <label>
              Location
              <input
                name="hunt-location"
                value={form.location}
                onChange={(e) =>
                  editHuntForm({ ...form, location: e.target.value })
                }
                placeholder="Remote or leave blank"
              />
            </label>
            <div className="double">
              <label>
                Required keywords
                <input
                  name="hunt-required-keywords"
                  value={form.required}
                  onChange={(e) =>
                    editHuntForm({ ...form, required: e.target.value })
                  }
                  placeholder="typescript, react"
                />
              </label>
              <label>
                Exclude keywords
                <input
                  name="hunt-excluded-keywords"
                  value={form.excluded}
                  onChange={(e) =>
                    editHuntForm({ ...form, excluded: e.target.value })
                  }
                  placeholder="senior, clearance"
                />
              </label>
            </div>
            <label>
              Minimum profile fit: <b>{form.minFit}%</b>
              <input
                name="hunt-minimum-fit"
                type="range"
                min="30"
                max="95"
                value={form.minFit}
                onChange={(e) =>
                  editHuntForm({ ...form, minFit: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Maximum results
              <select
                name="hunt-maximum-results"
                value={form.maxResults}
                onChange={(e) =>
                  editHuntForm({
                    ...form,
                    maxResults: Number(e.target.value),
                  })
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
          <button
            className="secondary"
            disabled={running || selectedRuns.length === 0}
            onClick={run}
          >
            Run once
          </button>
          <label className="v2-hunt-interval">
            Repeat
            <select
              name="infinite-hunt-interval"
              aria-label="Infinite Hunt interval"
              value={intervalMinutes}
              disabled={running || state.infiniteHunt?.enabled}
              onChange={(event) => {
                setIntervalMinutes(event.target.value);
                setHuntDraftTouched(true);
                setHuntDraftRestored(false);
              }}
            >
              <option value="15">Every 15 minutes</option>
              <option value="60">Every hour</option>
              <option value="240">Every 4 hours</option>
              <option value="1440">Every day</option>
            </select>
          </label>
          <button
            disabled={
              running ||
              selectedRuns.length === 0 ||
              state.infiniteHunt?.enabled
            }
            onClick={startInfiniteHunt}
          >
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
                    {formatDateTime(run.completedAt || run.createdAt)} ·{" "}
                    {run.added ?? run.found} saved · {run.duplicates || 0}{" "}
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
            tabIndex={-1}
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
              Started {formatDateTime(latestRun.createdAt)}
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
  const newRunCloseRef = useRef(null);
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
    try {
      await api("/api/agent-runs/delete", {
        method: "POST",
        body: JSON.stringify({ ids: deleteIds }),
      });
      setSelectedRun(null);
      setSelectedIds(new Set());
      setDeleteIds([]);
      await reload();
    } catch (error) {
      throw error;
    }
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
    if (!newRunOpen) return undefined;
    const returnFocus = document.activeElement;
    newRunCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setNewRunOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus?.();
    };
  }, [newRunOpen]);
  useEffect(() => {
    if (!actionMenuOpen) return undefined;
    requestAnimationFrame(() =>
      document.getElementById(`run-action-delete-${actionMenuOpen}`)?.focus(),
    );
    const closeActionMenu = (event) => {
      const menuContainer = document.getElementById(
        `run-actions-${actionMenuOpen}`,
      );
      if (event.key === "Escape") {
        event.preventDefault();
        setActionMenuOpen(null);
        document
          .getElementById(`run-actions-trigger-${actionMenuOpen}`)
          ?.focus();
      } else if (
        event.type === "mousedown" &&
        !menuContainer?.contains(event.target)
      ) {
        setActionMenuOpen(null);
      }
    };
    window.addEventListener("keydown", closeActionMenu);
    window.addEventListener("mousedown", closeActionMenu);
    return () => {
      window.removeEventListener("keydown", closeActionMenu);
      window.removeEventListener("mousedown", closeActionMenu);
    };
  }, [actionMenuOpen]);
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
  const handleRunTemplateKeyDown = (event, templateId) => {
    const templateIds = HUNT_WORKFLOWS.map(([id]) => id);
    const currentIndex = templateIds.indexOf(templateId);
    let nextIndex = currentIndex;
    if (["ArrowRight", "ArrowDown"].includes(event.key))
      nextIndex = (currentIndex + 1) % templateIds.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key))
      nextIndex = (currentIndex - 1 + templateIds.length) % templateIds.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = templateIds.length - 1;
    else return;
    event.preventDefault();
    const nextTemplate = templateIds[nextIndex];
    setNewRunTemplate(nextTemplate);
    document.getElementById(`run-template-${nextTemplate}`)?.focus();
  };
  return (
    <section className="v2-runs-page">
      <div className="v2-page-intro">
        <div>
          <h1>Agent Runs</h1>
          <p>Manage and monitor your job hunting agent runs</p>
        </div>
        <div className="inline">
          <button
            className="secondary v2-open-latest-run"
            disabled={!runs.length}
            onClick={() => setSelectedRun(runs[0])}
          >
            Open Latest Run
          </button>
          <button
            className="v2-new-run-button"
            onClick={() => setNewRunOpen(true)}
          >
            <Plus size={16} /> New Run
          </button>
        </div>
      </div>
      <div className="v2-runs-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            name="agent-run-search"
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
              name="action-required-only"
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
            name="select-visible-agent-runs"
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
              name={`select-agent-run-${run.id}`}
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
            <div id={`run-actions-${run.id}`} className="v2-run-action-menu">
              <button
                id={`run-actions-trigger-${run.id}`}
                className="v2-run-delete"
                aria-label={`Actions for ${run.runName || run.search?.q || "run"}`}
                aria-haspopup="menu"
                aria-expanded={actionMenuOpen === run.id}
                aria-controls={`run-actions-menu-${run.id}`}
                onClick={() =>
                  setActionMenuOpen((open) => (open === run.id ? null : run.id))
                }
              >
                <MoreHorizontal size={16} />
              </button>
              {actionMenuOpen === run.id && (
                <div id={`run-actions-menu-${run.id}`} role="menu">
                  <button
                    id={`run-action-delete-${run.id}`}
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
            tabIndex={-1}
            aria-label="Close run details"
            onClick={() => setSelectedRun(null)}
          />
          <div className="v2-session-content v2-run-detail-modal">
            <div className="v2-session-head">
              <div>
                <span>AGENT RUN</span>
                <h2 id="run-detail-title">
                  {selectedRun.runName || selectedRun.search?.q || "Local hunt"}
                </h2>
              </div>
              <span className="pill submitted">Completed</span>
            </div>
            <p className="v2-session-time">
              {selectedRun.search?.location || "All locations"} · Started{" "}
              {formatDateTime(selectedRun.createdAt)}
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
                <h3>Workflow progress</h3>
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
                <h3>Matched jobs</h3>
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
                  const options = selectedRun.options || {};
                  localStorage.setItem(
                    "jobhuntr-new-run-draft",
                    JSON.stringify({
                      runName:
                        selectedRun.runName ||
                        selectedRun.search?.q ||
                        "Local hunt",
                      origin: "manual",
                      q: selectedRun.search?.q || options.q || "",
                      location:
                        selectedRun.search?.location || options.location || "",
                      minFit: selectedRun.minFit ?? options.minFit ?? 60,
                      maxResults: options.maxResults ?? 25,
                      requiredKeywords: options.requiredKeywords || [],
                      excludeKeywords: options.excludeKeywords || [],
                      workflows:
                        selectedRun.workflows || options.workflows || [],
                      optimizeResume: Boolean(
                        selectedRun.optimizeResume ?? options.optimizeResume,
                      ),
                    }),
                  );
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
            tabIndex={-1}
            aria-label="Close new agent run"
            onClick={() => setNewRunOpen(false)}
          />
          <div className="v2-session-content v2-new-run-modal">
            <div className="v2-new-run-head">
              <div>
                <span>NEW WORKFLOW</span>
                <h2 id="new-agent-run-title">Create New Agent Run</h2>
              </div>
              <button
                ref={newRunCloseRef}
                className="v2-run-delete"
                aria-label="Close"
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
                  id={`run-template-${id}`}
                  type="button"
                  role="radio"
                  aria-checked={newRunTemplate === id}
                  tabIndex={newRunTemplate === id ? 0 : -1}
                  className={newRunTemplate === id ? "selected" : ""}
                  key={id}
                  onClick={() => setNewRunTemplate(id)}
                  onKeyDown={(event) => handleRunTemplateKeyDown(event, id)}
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
                name="new-agent-run-name"
                value={newRunName}
                onChange={(event) => setNewRunName(event.target.value)}
                placeholder="Software Engineer"
              />
            </label>
            <label className="v2-check-row v2-new-run-option">
              <input
                type="checkbox"
                name="new-agent-run-optimize-resume"
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
    const normalizeUserTab = (value) =>
      value === "about" ? "about-me" : value;
    const normalizedLinkedTab = normalizeUserTab(linkedTab);
    const normalizedPending = normalizeUserTab(pending);
    return ["profile", "coaches", "about-me", "settings"].includes(
      normalizedLinkedTab,
    )
      ? normalizedLinkedTab
      : ["profile", "coaches", "about-me", "settings"].includes(
            normalizedPending,
          )
        ? normalizedPending
        : "profile";
  });
  useEffect(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const params = new URLSearchParams(hashQuery);
    if (params.get("tab") !== "about") return;
    params.set("tab", "about-me");
    window.history.replaceState(
      { tab: "settings", userTab: "about-me" },
      "",
      `#/settings?${params}`,
    );
  }, []);
  const [saved, setSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const savingProfileRef = useRef(false);
  const extractingProfileResumeRef = useRef(false);
  const formRevision = useRef(0);
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
    resumeFileName: "",
    resumeError: "",
    extractingResume: false,
  });
  const markFormDirty = () => {
    formRevision.current += 1;
    setSaved(false);
  };
  const editForm = (next) => {
    markFormDirty();
    setForm(next);
  };
  const save = async () => {
    if (savingProfileRef.current || extractingProfileResumeRef.current) return;
    savingProfileRef.current = true;
    const savingRevision = formRevision.current;
    setSavingProfile(true);
    setSaved(false);
    const fullName = `${form.firstName || ""} ${form.lastName || ""}`.trim();
    try {
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
      if (formRevision.current === savingRevision) setSaved(true);
    } catch {
      // Preserve edits for retry while the shared error surface reports why.
    } finally {
      savingProfileRef.current = false;
      setSavingProfile(false);
    }
  };
  const loadProfileResume = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || extractingProfileResumeRef.current || savingProfileRef.current)
      return;
    extractingProfileResumeRef.current = true;
    markFormDirty();
    setForm((current) => ({
      ...current,
      resumeError: "",
      extractingResume: true,
    }));
    try {
      const resumeText = await extractResumeFileText(file);
      setForm((current) => ({
        ...current,
        resumeFileName: file.name,
        resumeText,
        resumeError: "",
        extractingResume: false,
      }));
    } catch (error) {
      setForm((current) => ({
        ...current,
        resumeError: error.message,
        extractingResume: false,
      }));
    } finally {
      extractingProfileResumeRef.current = false;
      input.value = "";
    }
  };
  const profileDisplayName =
    `${form.firstName || ""} ${form.lastName || ""}`.trim() ||
    form.name ||
    "Job Hunter";
  const resumeRegressionBlocked =
    isUsableResumeText(p.resumeText) && !isUsableResumeText(form.resumeText);
  const usage = [
    ["Generated Resumes", state.resumes.length, "versions created"],
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
    editForm({
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
      const normalizedTab = linkedTab === "about" ? "about-me" : linkedTab;
      if (linkedTab === "about")
        window.history.replaceState(
          { tab: "settings", userTab: "about-me" },
          "",
          "#/settings?tab=about-me",
        );
      if (
        ["profile", "coaches", "about-me", "settings"].includes(normalizedTab)
      )
        setActiveTab(normalizedTab);
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
  const userTabs = [
    ["profile", "Profile & Usage"],
    ["coaches", "Coaches"],
    ["about-me", "About Me"],
    ["settings", "Settings"],
  ];
  useEffect(() => {
    if (!window.matchMedia("(max-width: 560px)").matches) return;
    window.requestAnimationFrame(() =>
      document
        .getElementById(`user-tab-${activeTab}`)
        ?.scrollIntoView({ block: "nearest", inline: "center" }),
    );
  }, [activeTab]);
  const handleUserTabKeyDown = (event, value) => {
    const currentIndex = userTabs.findIndex(([tab]) => tab === value);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % userTabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + userTabs.length) % userTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = userTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = userTabs[nextIndex][0];
    selectTab(nextTab);
    document.getElementById(`user-tab-${nextTab}`)?.focus();
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
          const deletionRevision = formRevision.current;
          const targetId = faqDeleteTarget.id;
          setSaved(false);
          const result = await api("/api/profile/faqs/delete", {
            method: "POST",
            body: JSON.stringify({
              id: targetId,
              question: faqDeleteTarget.question,
            }),
          });
          if (!Array.isArray(result.faqAnswers))
            throw new Error("FAQ deletion was not saved");
          await reload();
          setForm((current) => ({
            ...current,
            faqAnswers: current.faqAnswers.filter((answer) =>
              targetId
                ? answer.id !== targetId
                : answer.question !== faqDeleteTarget.question,
            ),
          }));
          if (formRevision.current === deletionRevision) setSaved(true);
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
        {userTabs.map(([value, label]) => (
          <button
            key={value}
            id={`user-tab-${value}`}
            role="tab"
            aria-selected={activeTab === value}
            aria-controls={`user-panel-${value}`}
            tabIndex={activeTab === value ? 0 : -1}
            onClick={() => selectTab(value)}
            onKeyDown={(event) => handleUserTabKeyDown(event, value)}
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
        <div
          id="user-panel-profile"
          className="card v2-user-profile-card"
          role="tabpanel"
          aria-labelledby="user-tab-profile"
        >
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
                    name={`profile-${key}`}
                    value={form[key] || ""}
                    placeholder={placeholder}
                    onChange={(event) =>
                      editForm({ ...form, [key]: event.target.value })
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
                    name={`profile-${key}`}
                    value={form[key] || ""}
                    onChange={(event) =>
                      editForm({ ...form, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="v2-user-details-section v2-profile-resume-section">
            <div className="v2-profile-resume-heading">
              <div>
                <h4>Base resume</h4>
                <p>
                  Used for ATS analysis, application packets, and truthful
                  career guidance.
                </p>
              </div>
              <span
                className={`pill ${isUsableResumeText(form.resumeText) ? "completed" : "failed"}`}
              >
                {isUsableResumeText(form.resumeText)
                  ? "Ready"
                  : "Resume required"}
              </span>
            </div>
            <label className="v2-template-dropzone v2-profile-resume-dropzone">
              <Upload size={24} />
              <b>{form.resumeFileName || "Replace resume from a file"}</b>
              <span>PDF, HTML, or TXT · processed only on this device</span>
              <input
                name="profile-resume-file"
                aria-label="Replace base resume"
                type="file"
                disabled={form.extractingResume || savingProfile}
                accept=".pdf,.html,.htm,.txt,text/plain,text/html,application/pdf"
                onChange={loadProfileResume}
              />
            </label>
            {form.extractingResume && (
              <div className="v2-template-upload-progress" role="status">
                <RefreshCcw size={17} /> Extracting resume text locally…
              </div>
            )}
            {form.resumeError && (
              <div className="v2-submit-safety-note" role="alert">
                {form.resumeError}
              </div>
            )}
            <label>
              Resume text
              <textarea
                name="profile-resume-text"
                aria-label="Base resume text"
                disabled={form.extractingResume || savingProfile}
                value={form.resumeText}
                onChange={(event) => {
                  editForm({
                    ...form,
                    resumeText: event.target.value,
                    resumeError: "",
                  });
                }}
                placeholder="Paste your complete resume here…"
              />
            </label>
            <small>
              {form.resumeText.trim().length.toLocaleString()} characters · Save
              profile to keep changes
            </small>
            {resumeRegressionBlocked && (
              <div className="v2-submit-safety-note" role="alert">
                Keep a complete resume in your profile. Upload a replacement or
                restore the previous content before saving.
              </div>
            )}
          </div>
          <button
            disabled={
              savingProfile || form.extractingResume || resumeRegressionBlocked
            }
            aria-busy={savingProfile}
            onClick={save}
          >
            <Save size={16} /> {savingProfile ? "Saving…" : "Save profile"}
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
        <div
          id="user-panel-coaches"
          className="v2-user-coaches"
          role="tabpanel"
          aria-labelledby="user-tab-coaches"
        >
          <div className="card v2-coach-access-card">
            <div className="v2-coach-avatar">
              <Sparkles size={22} />
            </div>
            <div>
              <span className="eyebrow">PRIVATE COACHING WORKSPACE</span>
              <h3>JobHuntr Career Coach</h3>
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
              <button onClick={() => setTab("coach")}>Open Career Coach</button>
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
                        {formatCalendarDate(
                          session.updatedAt || session.createdAt,
                        )}
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
                  Open Career Coach to prepare for a role or practice an answer.
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
      {activeTab === "about-me" && (
        <div
          id="user-panel-about-me"
          className="v2-about-hub"
          role="tabpanel"
          aria-labelledby="user-tab-about-me"
        >
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
                name="profile-career-context"
                value={form.additionalInfo}
                onChange={(event) =>
                  editForm({ ...form, additionalInfo: event.target.value })
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
            <button
              disabled={savingProfile}
              aria-busy={savingProfile}
              onClick={save}
            >
              <Save size={16} /> {savingProfile ? "Saving…" : "Save About Me"}
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
                        name={`profile-faq-${faq.id || index}`}
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
                          editForm({ ...form, faqAnswers });
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
                <button
                  disabled={savingProfile}
                  aria-busy={savingProfile}
                  onClick={save}
                >
                  <Save size={16} />
                  {savingProfile ? "Saving…" : "Save FAQ answers"}
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
        <div
          id="user-panel-settings"
          className="v2-settings-grid"
          role="tabpanel"
          aria-labelledby="user-tab-settings"
        >
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
                name="settings-target-roles"
                value={form.targetRoles}
                onChange={(event) =>
                  editForm({ ...form, targetRoles: event.target.value })
                }
              />
            </label>
            <label>
              Skills
              <input
                name="settings-skills"
                value={form.skills}
                onChange={(event) =>
                  editForm({ ...form, skills: event.target.value })
                }
              />
            </label>
            <label>
              Preferred locations
              <input
                name="settings-locations"
                value={form.locations || ""}
                onChange={(e) =>
                  editForm({ ...form, locations: e.target.value })
                }
              />
            </label>
            <label>
              Minimum salary
              <input
                name="settings-minimum-salary"
                type="number"
                value={form.minSalary || 0}
                onChange={(e) =>
                  editForm({ ...form, minSalary: e.target.value })
                }
              />
            </label>
            <label>
              Weekly application goal
              <input
                name="settings-weekly-application-goal"
                type="number"
                min="1"
                max="100"
                value={form.weeklyApplicationGoal}
                onChange={(e) =>
                  editForm({ ...form, weeklyApplicationGoal: e.target.value })
                }
              />
            </label>
            <label className="v2-threshold-setting">
              <span>
                ATS template application threshold
                <strong>{form.atsThreshold}%</strong>
              </span>
              <input
                name="settings-ats-threshold"
                type="range"
                min="50"
                max="100"
                step="5"
                value={form.atsThreshold}
                onChange={(event) =>
                  editForm({
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
                name="settings-remote-roles"
                type="checkbox"
                checked={form.remote}
                onChange={(e) =>
                  editForm({ ...form, remote: e.target.checked })
                }
              />{" "}
              Include remote roles
            </label>
            <p className="hint">
              Used for local fit scores and hunt defaults. Nothing is sent over
              the network.
            </p>
            <button
              disabled={savingProfile}
              aria-busy={savingProfile}
              onClick={save}
            >
              <Save size={16} /> {savingProfile ? "Saving…" : "Save settings"}
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
  const [backupError, setBackupError] = useState("");
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [inspectingBackup, setInspectingBackup] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const restoreCancelRef = useRef(null);
  const restoreReturnFocusRef = useRef(null);
  const restoringRef = useRef(false);
  const backupInspectionId = useRef(0);
  const importingCsvRef = useRef(false);
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
    if (!backupFile || restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    setBackupError("");
    try {
      await api("/api/import", {
        method: "POST",
        body: await backupFile.text(),
        suppressGlobalError: true,
      });
      location.reload();
    } catch (error) {
      setBackupError(error.message || "The workspace could not be restored.");
      setRestoreOpen(false);
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  };
  const inspectBackup = async (file) => {
    const inspectionId = ++backupInspectionId.current;
    setBackupFile(file || null);
    setBackupPreview(null);
    setBackupError("");
    setInspectingBackup(false);
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setBackupError("JobHuntr backups must be 50 MB or smaller.");
      return;
    }
    setInspectingBackup(true);
    try {
      const preview = await api("/api/import/preview", {
        method: "POST",
        body: await file.text(),
        suppressGlobalError: true,
      });
      if (backupInspectionId.current === inspectionId)
        setBackupPreview(preview);
    } catch (error) {
      if (backupInspectionId.current === inspectionId)
        setBackupError(
          error.message || "This file is not a valid JobHuntr JSON backup.",
        );
    } finally {
      if (backupInspectionId.current === inspectionId)
        setInspectingBackup(false);
    }
  };
  const importCsv = async () => {
    if (!csvFile || importingCsvRef.current) return;
    importingCsvRef.current = true;
    setImportingCsv(true);
    const jobs = parseCsv(await csvFile.text());
    if (!jobs.length) {
      setResult({
        error: "No rows with company and title columns were found.",
      });
      importingCsvRef.current = false;
      setImportingCsv(false);
      return;
    }
    try {
      const response = await api("/api/import/jobs", {
        method: "POST",
        body: JSON.stringify({ jobs }),
      });
      setResult(response);
    } catch {
      // Keep the selected CSV available so importing can be retried.
    } finally {
      importingCsvRef.current = false;
      setImportingCsv(false);
    }
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
          <div>
            <dt>Coach chats</dt>
            <dd>{state.coachConversations.length}</dd>
          </div>
        </dl>
      </div>
      <div className="grid v2-data-grid">
        <div className="card v2-data-card">
          <h3>
            <ShieldCheck /> Local-first guarantees
          </h3>
          <p>
            All personal data persists in JobHuntr&apos;s private local data
            directory. There is no hosted database, telemetry, auth vendor, or
            required API key.
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
              <small>JobHuntr export · up to 5,000 jobs or 50 MB</small>
            </span>
            <input
              name="restore-workspace-file"
              type="file"
              accept=".json,application/json"
              aria-label="Import JobHuntr JSON backup"
              disabled={inspectingBackup || restoring}
              onChange={(e) => inspectBackup(e.target.files?.[0])}
            />
          </label>
          {backupPreview && (
            <div className="v2-backup-preview" role="status">
              Contains {backupPreview.jobs} jobs, {backupPreview.resumes}{" "}
              resumes, {backupPreview.letters} letters, {backupPreview.runs}{" "}
              runs, and {backupPreview.chats} coach chats.
              {!backupPreview.profileIncluded && (
                <small>
                  This backup has no profile. Your profile will reset to the
                  first-run defaults.
                </small>
              )}
              {backupPreview.infiniteHuntActive && (
                <small>
                  Infinite Hunt was active in this backup and will resume after
                  restore.
                </small>
              )}
            </div>
          )}
          {backupError && (
            <p className="error" role="alert">
              {backupError}
            </p>
          )}
          <button
            disabled={!backupPreview || inspectingBackup || restoring}
            aria-busy={inspectingBackup}
            onClick={() => setRestoreOpen(true)}
          >
            {inspectingBackup ? "Inspecting…" : "Review restore"}
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
              name="import-jobs-csv"
              type="file"
              accept=".csv,text/csv"
              aria-label="Import jobs CSV"
              disabled={importingCsv}
              onChange={(e) => {
                setCsvFile(e.target.files?.[0]);
                setResult(null);
              }}
            />
          </label>
          <button
            disabled={!csvFile || importingCsv}
            aria-busy={importingCsv}
            onClick={importCsv}
          >
            {importingCsv ? "Importing…" : "Import CSV"}
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
            event.target === event.currentTarget &&
            !restoringRef.current &&
            setRestoreOpen(false)
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
              {backupPreview.resumes + backupPreview.letters} documents, plus{" "}
              {backupPreview.chats} private coach chats.
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
              <button
                disabled={restoring}
                aria-busy={restoring}
                onClick={restore}
              >
                {restoring ? "Restoring…" : "Replace workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
