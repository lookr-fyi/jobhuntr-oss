import { useEffect, useState } from "react";
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
} from "lucide-react";
import "./styles.css";
import { parseCsv } from "./csv.js";

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
  const [err, setErr] = useState("");
  const load = () =>
    api("/api/state")
      .then(setState)
      .catch((e) => setErr(e.message));
  useEffect(load, []);
  const tabs = [
    ["overview", LayoutDashboard],
    ["tracker", Briefcase],
    ["board", Search],
    ["queue", ListChecks],
    ["resume", FileText],
    ["coach", MessageSquare],
    ["agent", Bot],
    ["settings", Settings],
    ["privacy", ShieldCheck],
  ];
  if (!state)
    return (
      <div className="splash">
        <Sparkles /> Loading local JobHuntr…
      </div>
    );
  return (
    <div className="app">
      {state.profile.onboarded === false && (
        <Onboarding profile={state.profile} reload={load} />
      )}
      <aside>
        <div className="brand">
          <div className="logo">JH</div>
          <div>
            <b>JobHuntr OSS</b>
            <span>Local-first job search</span>
          </div>
        </div>
        {tabs.map(([name, Icon]) => (
          <button
            key={name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            <Icon size={18} />
            {name}
          </button>
        ))}
        <p className="local">
          No cloud. No accounts. Data stays in <code>./data</code>.
        </p>
      </aside>
      <main>
        <header>
          <div>
            <h1>{title(tab)}</h1>
            <p>{subtitle(tab)}</p>
          </div>
          <button onClick={load}>Refresh</button>
        </header>
        {err && <div className="error">{err}</div>}
        {tab === "overview" && <Overview state={state} setTab={setTab} />}{" "}
        {tab === "tracker" && <Tracker state={state} reload={load} />}{" "}
        {tab === "board" && <Board reload={load} />}{" "}
        {tab === "queue" && <Queue state={state} reload={load} />}{" "}
        {tab === "resume" && <Resume state={state} reload={load} />}{" "}
        {tab === "coach" && <Coach state={state} reload={load} />}{" "}
        {tab === "agent" && <Agent state={state} reload={load} />}{" "}
        {tab === "settings" && <SettingsPage state={state} reload={load} />}{" "}
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
            <span className="eyebrow">WELCOME TO JOBHUNTR OSS</span>
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
    agent: "Autonomous hunt",
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
    agent: "Run a transparent local workflow using your preferences.",
    settings: "Control the profile and criteria used for matching.",
    privacy: "Back up and restore a workspace with no cloud dependency.",
  }[t];
}
function Overview({ state, setTab }) {
  const s = state.summary;
  const stages = [
    "saved",
    "interested",
    "applied",
    "interview",
    "offer",
    "rejected",
  ];
  const priorityTasks = [
    ...s.overdueTasks,
    ...s.upcomingTasks.filter(
      (item) => !s.overdueTasks.some((overdue) => overdue.id === item.id),
    ),
  ];
  return (
    <section className="dashboard">
      <div className="card hero goal-card">
        <div>
          <span className="eyebrow">THIS WEEK</span>
          <h2>
            {s.applicationsThisWeek} of {s.weeklyGoal} applications
          </h2>
          <p>
            {s.weeklyGoalProgress >= 100
              ? "Weekly target reached. Keep the pipeline warm."
              : `${Math.max(0, s.weeklyGoal - s.applicationsThisWeek)} more application${s.weeklyGoal - s.applicationsThisWeek === 1 ? "" : "s"} to reach your goal.`}
          </p>
          <div className="inline">
            <button onClick={() => setTab("queue")}>
              <ListChecks size={16} /> Review queue
            </button>
            <button className="secondary" onClick={() => setTab("agent")}>
              <Bot size={16} /> Find matches
            </button>
          </div>
        </div>
        <div
          className="goal-ring"
          style={{ "--progress": `${s.weeklyGoalProgress * 3.6}deg` }}
        >
          <strong>{s.weeklyGoalProgress}%</strong>
          <span>complete</span>
        </div>
      </div>
      <div className="metric-grid">
        <div className="card metric">
          <span>TRACKED ROLES</span>
          <strong>{s.totalJobs}</strong>
          <small>{s.avgFit}% average fit</small>
        </div>
        <div className="card metric">
          <span>ACTIVE APPLICATIONS</span>
          <strong>{s.activeApplications}</strong>
          <small>applied through offer</small>
        </div>
        <div className="card metric">
          <span>RESPONSE RATE</span>
          <strong>{s.responseRate}%</strong>
          <small>applications reaching interview</small>
        </div>
        <div
          className={`card metric ${s.overdueTasks.length ? "attention" : ""}`}
        >
          <span>OVERDUE TASKS</span>
          <strong>{s.overdueTasks.length}</strong>
          <small>{s.upcomingTasks.length} due in seven days</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="card">
          <h3>Pipeline funnel</h3>
          {stages.map((stage) => (
            <div className="bar" key={stage}>
              <span>{stage}</span>
              <b
                style={{
                  width: `${Math.min(100, (s.byStatus[stage] || 0) * 18 + 8)}%`,
                }}
              >
                {s.byStatus[stage] || 0}
              </b>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="row">
            <h3>Next actions</h3>
            <button className="text-button" onClick={() => setTab("tracker")}>
              Open tracker
            </button>
          </div>
          {priorityTasks.length ? (
            priorityTasks.slice(0, 7).map((task) => {
              const overdue = s.overdueTasks.some(
                (item) => item.id === task.id,
              );
              return (
                <div
                  className={`next-action ${overdue ? "overdue" : ""}`}
                  key={task.id}
                >
                  <span>{overdue ? "!" : "→"}</span>
                  <div>
                    <b>{task.text}</b>
                    <small>
                      {task.company} ·{" "}
                      {task.due
                        ? `${overdue ? "overdue" : "due"} ${new Date(`${task.due}T12:00:00`).toLocaleDateString()}`
                        : "no due date"}
                    </small>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty">
              <p>No dated follow-ups. Add one from a tracked role.</p>
            </div>
          )}
        </div>
        <div className="card">
          <h3>Needs attention</h3>
          {s.staleJobs.length ? (
            s.staleJobs.slice(0, 6).map((job) => (
              <button
                className="attention-row"
                key={job.id}
                onClick={() => setTab("tracker")}
              >
                <b>{job.title}</b>
                <span>
                  {job.company} · {job.status}
                </span>
                <small>
                  Not updated since{" "}
                  {new Date(job.updatedAt).toLocaleDateString()}
                </small>
              </button>
            ))
          ) : (
            <p className="empty">No opportunities have gone stale.</p>
          )}
        </div>
        <div className="card">
          <h3>Recent activity</h3>
          <div className="timeline">
            {s.recentActivities.slice(0, 8).map((activity) => (
              <p key={activity.id}>
                <time>{new Date(activity.at).toLocaleString()}</time>
                {activity.message}
              </p>
            ))}
          </div>
        </div>
      </div>
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
        <input value={task} onChange={(e) => setTask(e.target.value)} />
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
  return (
    <section className="card">
      <div className="inline">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search role, skill, company"
        />
        <button onClick={search}>
          <Search size={16} /> Search
        </button>
      </div>
      <div className="resultgrid">
        {results.map((j, i) => (
          <div className="jobcard" key={`${j.url}-${i}`}>
            <b>{j.title}</b>
            <span>
              {j.company} · {j.location}
            </span>
            <p>{j.description}</p>
            <em>{j.fitScore}% fit</em>
            <button
              onClick={async () => {
                await api("/api/jobs", {
                  method: "POST",
                  body: JSON.stringify(j),
                });
                reload();
              }}
            >
              Save to tracker
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
function Queue({ state, reload }) {
  const [jobId, setJobId] = useState(state.jobs[0]?.id || "");
  const active = state.submissions.filter((s) => s.status !== "archived");
  const create = async () => {
    await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        jobId,
        resumeId: state.resumes[0]?.id || "",
        coverLetterId: state.coverLetters[0]?.id || "",
      }),
    });
    reload();
  };
  return (
    <section className="grid">
      <div className="card hero">
        <h2>Application review</h2>
        <p>
          Create a packet, complete its checklist, then record submission.
          JobHuntr never submits externally or stores credentials.
        </p>
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          {state.jobs
            .filter((j) => !["applied", "rejected"].includes(j.status))
            .map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} — {j.title}
              </option>
            ))}
        </select>
        <button disabled={!jobId} onClick={create}>
          <Plus size={16} /> Create packet
        </button>
      </div>
      <div className="card wide">
        <h3>Packets · {active.length}</h3>
        {active.length ? (
          active.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              state={state}
              reload={reload}
            />
          ))
        ) : (
          <p className="empty">
            No packets yet. Choose a tracked role to begin.
          </p>
        )}
      </div>
    </section>
  );
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
function Resume({ state, reload }) {
  const [resume, setResume] = useState(state.profile.resumeText);
  const [name, setName] = useState("Targeted resume");
  const [templateId, setTemplateId] = useState(
    state.templates?.[0]?.id || "clean-ats",
  );
  const [jobId, setJobId] = useState(state.jobs[0]?.id || "");
  const [score, setScore] = useState(null);
  const [letter, setLetter] = useState(state.coverLetters[0] || null);
  const [preview, setPreview] = useState(state.resumes[0] || null);
  const saveResume = async () => {
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ resumeText: resume }),
    });
    const saved = await api("/api/resumes", {
      method: "POST",
      body: JSON.stringify({ name, templateId, content: resume }),
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
  return (
    <section className="resume-studio">
      <div className="card resume-editor">
        <div className="row">
          <h3>Resume editor</h3>
          <span className="pill">local draft</span>
        </div>
        <div className="triple">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Version name"
          />
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {state.templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {state.jobs.map((j) => (
              <option value={j.id} key={j.id}>
                {j.company} — {j.title}
              </option>
            ))}
          </select>
        </div>
        <textarea
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
        <h3>Cover letters</h3>
        <button onClick={generateLetter}>
          <Sparkles size={16} /> Generate for selected role
        </button>
        {state.coverLetters.map((item) => (
          <button
            className={
              letter?.id === item.id ? "letter-row selected" : "letter-row"
            }
            key={item.id}
            onClick={() => setLetter(item)}
          >
            <b>{item.title}</b>
            <small>
              {new Date(item.updatedAt || item.createdAt).toLocaleDateString()}
            </small>
          </button>
        ))}
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
      <div className="card letter-editor">
        <div className="row">
          <h3>Cover letter editor</h3>
          {letter && (
            <a
              href={`/print/cover-letter/${letter.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Print / PDF ↗
            </a>
          )}
        </div>
        {letter ? (
          <>
            <input
              value={letter.title}
              onChange={(e) => setLetter({ ...letter, title: e.target.value })}
            />
            <textarea
              className="letter"
              value={letter.body}
              onChange={(e) => setLetter({ ...letter, body: e.target.value })}
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
          <p className="empty">Generate or select a cover letter to edit it.</p>
        )}
      </div>
    </section>
  );
}
function Coach({ state, reload }) {
  const [view, setView] = useState("practice");
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
  return (
    <section className="coach-page">
      <div className="card coach-toolbar">
        <div className="segmented">
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
function Agent({ state, reload }) {
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
  const [running, setRunning] = useState(false);
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
  });
  const loadPreset = (preset) =>
    setForm({
      ...form,
      ...preset.options,
      required: (preset.options.requiredKeywords || []).join(", "),
      excluded: (preset.options.excludeKeywords || []).join(", "),
    });
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
  return (
    <section className="hunt-layout">
      <div className="card hunt-config">
        <span className="eyebrow">EXPLAINABLE LOCAL AUTOMATION</span>
        <h2>Configure a hunt</h2>
        <p>
          Searches the bundled offline catalog only. Preview every match and
          reason before saving—no browser credentials or external submissions.
        </p>
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
              onChange={(e) => setForm({ ...form, required: e.target.value })}
              placeholder="typescript, react"
            />
          </label>
          <label>
            Exclude keywords
            <input
              value={form.excluded}
              onChange={(e) => setForm({ ...form, excluded: e.target.value })}
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
        <div className="inline">
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
          <button disabled={running} onClick={run}>
            <Bot size={16} />
            {running ? "Running…" : "Run & save"}
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
      <div className="hunt-results">
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
        <div className="card">
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
    <section className="split">
      <div className="card">
        <h3>Your local profile</h3>
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
      <div className="card">
        <h3>Search preferences</h3>
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
        <button onClick={save}>
          <Save size={16} /> Save preferences
        </button>
        <p className="hint">
          Used for local fit scores and hunt defaults. Nothing is sent over the
          network.
        </p>
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
    <section className="grid">
      <div className="card">
        <h3>
          <ShieldCheck /> Local-first guarantees
        </h3>
        <p>
          All personal data persists to <code>./data/jobhuntr.json</code>. There
          is no hosted database, telemetry, auth vendor, or required API key.
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
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
