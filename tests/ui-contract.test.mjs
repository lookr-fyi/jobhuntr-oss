import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every rendered form control has a stable name for browser identification", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const controls = [
    ...source.matchAll(/<(input|select|textarea)\b[\s\S]*?\/?>/g),
  ];
  const unnamed = controls
    .filter((match) => !/\bname\s*=/.test(match[0]))
    .map((match) => ({
      line: source.slice(0, match.index).split("\n").length,
      control: match[0].replace(/\s+/g, " ").slice(0, 180),
    }));

  assert.deepEqual(
    unnamed,
    [],
    "inputs, selects, and textareas must remain identifiable to Chrome, autofill, and E2E tooling",
  );
});

test("persisted timestamps cannot bypass safe date formatters", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const unsafeDateFormatting = [
    ...source.matchAll(
      /new Date\((?!\s*\))[^;]*?\)\.toLocale(?:DateString|String)\(/g,
    ),
  ].map((match) => ({
    line: source.slice(0, match.index).split("\n").length,
    expression: match[0].replace(/\s+/g, " ").slice(0, 180),
  }));

  assert.deepEqual(
    unsafeDateFormatting,
    [],
    "persisted dates must use formatCalendarDate or formatDateTime so corrupt records cannot render Invalid Date",
  );
});

test("every JobHuntr CSS custom property is defined", async () => {
  const source = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const definitions = new Set(
    [...source.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]),
  );
  const usages = new Set(
    [...source.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((match) => match[1]),
  );
  const undefinedProperties = [...usages]
    .filter((property) => !definitions.has(property))
    .sort();

  assert.deepEqual(
    undefinedProperties,
    [],
    "undefined CSS variables silently make v2 controls transparent or drop their styling",
  );
});

test("user-triggered API actions contain rejected requests", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const uncontained = [];
  for (const match of source.matchAll(
    /const\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/g,
  )) {
    const end = source.indexOf("\n  };", match.index + match[0].length);
    if (end < 0) continue;
    const body = source.slice(match.index + match[0].length, end);
    if (body.includes("await api(") && !body.includes("catch"))
      uncontained.push({
        action: match[1],
        line: source.slice(0, match.index).split("\n").length,
      });
  }

  assert.deepEqual(
    uncontained,
    [],
    "async UI actions must preserve their form state and let the shared error surface handle failed API requests",
  );
});

test("modal dialogs receive focus and return it to their trigger", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const useDialogFocusManagement = \(\) =>/);
  assert.match(source, /document\.querySelectorAll\('\[role="dialog"\]'\)/);
  assert.match(source, /returnFocus = document\.activeElement/);
  assert.match(source, /returnFocus\.focus\(\)/);
  assert.match(source, /function App\(\) \{\s+useDialogFocusManagement\(\);/);
});

test("an uncaught renderer failure has a local recovery screen", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /class ErrorBoundary extends Component/);
  assert.match(source, /static getDerivedStateFromError\(error\)/);
  assert.match(source, /Your local workspace was not cleared or uploaded/);
  assert.match(source, /<ErrorBoundary>\s*<App \/>\s*<\/ErrorBoundary>/);
});

test("dense v2 controls keep usable touch targets on compact screens", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /@media \(max-width: 760px\), \(pointer: coarse\)/);
  assert.match(styles, /\.v2-run-delete,[\s\S]*?min-width: 36px/);
  assert.match(styles, /\.v2-coach-delete[\s\S]*?min-height: 36px/);
});

test("v2 getting-started guidance does not obscure the expanded sidebar", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const guidance = source.slice(
    source.indexOf("function GettingStarted"),
    source.indexOf("function App()"),
  );

  assert.match(guidance, /useState\(false\)/);
  assert.match(guidance, /aria-controls="getting-started-checklist"/);
  assert.match(guidance, /id="getting-started-checklist"/);
});

test("refresh, bulk outreach, and legacy migration failures stay contained", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  for (const action of ["refresh", "markSelectedOutreached"]) {
    const start = source.indexOf(`const ${action} = async`);
    assert.notEqual(start, -1, `${action} must exist`);
    const nextAction = source.indexOf("\n  };", start);
    const body = source.slice(start, nextAction);
    assert.match(body, /catch/, `${action} must contain rejected work`);
  }
  assert.match(source, /void migrate\(\)\.catch/);
});

test("ATS template scoring is single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const advanceTemplateWizard = async");
  const end = source.indexOf("\n  const saveResume", start);
  const scoringFlow = source.slice(start, end);

  assert.match(scoringFlow, /scoring: true/);
  assert.match(scoringFlow, /try \{/);
  assert.match(scoringFlow, /catch \{/);
  assert.match(scoringFlow, /scoring: false/);
  assert.match(scoringFlow, /templateOperationRef\.current/);
  assert.match(source, /templateDialogBusy \|\|/);
  assert.match(source, /"Scoring…"/);
});

test("first-run onboarding cannot duplicate saves or overlap resume extraction", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const onboarding = source.slice(
    source.indexOf("function Onboarding("),
    source.indexOf("function title("),
  );

  for (const operation of ["saving", "extractingResume"]) {
    assert.match(
      onboarding,
      new RegExp(`const ${operation}Ref = useRef\\(false\\)`),
    );
    assert.match(onboarding, new RegExp(`${operation}Ref\\.current = true`));
    assert.match(onboarding, new RegExp(`${operation}Ref\\.current = false`));
  }
  assert.match(
    onboarding,
    /if \(savingRef\.current \|\| extractingResumeRef\.current\) return/,
  );
  assert.match(
    onboarding,
    /if \(!file \|\| extractingResumeRef\.current \|\| savingRef\.current\) return/,
  );
  assert.match(onboarding, /disabled=\{form\.extractingResume \|\| saving\}/);
  assert.match(onboarding, /aria-busy=\{saving\}/);
});

test("Resume Studio save and scoring actions are single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const resumeStudio = source.slice(
    source.indexOf("function Resume("),
    source.indexOf("function SettingsPage"),
  );

  for (const action of ["savingResume", "scoringResume"]) {
    assert.match(resumeStudio, new RegExp(`const \\[${action}, set`));
    assert.match(
      resumeStudio,
      new RegExp(`const ${action}Ref = useRef\\(false\\)`),
    );
    assert.match(
      resumeStudio,
      new RegExp(`if \\(${action}Ref\\.current\\) return`),
    );
    assert.match(resumeStudio, new RegExp(`${action}Ref\\.current = true`));
    assert.match(resumeStudio, new RegExp(`${action}Ref\\.current = false`));
  }
  assert.match(resumeStudio, /finally \{[\s\S]*?setSavingResume\(false\)/);
  assert.match(resumeStudio, /finally \{[\s\S]*?setScoringResume\(false\)/);
  assert.match(resumeStudio, /aria-busy=\{savingResume\}/);
  assert.match(resumeStudio, /aria-busy=\{scoringResume\}/);
  assert.match(resumeStudio, /"Saving…" : "Save version"/);
  assert.match(resumeStudio, /"Analyzing…" : "Analyze ATS fit"/);
  const saveVersion = resumeStudio.slice(
    resumeStudio.indexOf("const saveResume = async"),
    resumeStudio.indexOf("const scoreResume = async"),
  );
  assert.match(saveVersion, /api\("\/api\/resumes"/);
  assert.match(saveVersion, /updateProfile: true/);
  assert.doesNotMatch(saveVersion, /api\("\/api\/profile"/);
});

test("Infinite Hunt actions reject same-frame duplicate starts", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const agent = source.slice(
    source.indexOf("function Agent("),
    source.indexOf("function AgentRuns"),
  );

  for (const action of ["running", "previewing", "savingPreset"]) {
    assert.match(agent, new RegExp(`const ${action}Ref = useRef\\(false\\)`));
    assert.match(
      agent,
      action === "running"
        ? /if \(runningRef\.current \|\| stoppingInfiniteRef\.current\) return/
        : new RegExp(`if \\(${action}Ref\\.current\\) return`),
    );
    assert.match(agent, new RegExp(`${action}Ref\\.current = true`));
    assert.match(agent, new RegExp(`${action}Ref\\.current = false`));
  }
  const oneOff = agent.slice(
    agent.indexOf("const run = async"),
    agent.indexOf("const startInfiniteHunt"),
  );
  const recurring = agent.slice(
    agent.indexOf("const startInfiniteHunt"),
    agent.indexOf("const previewMatches"),
  );
  assert.match(oneOff, /runningRef\.current/);
  assert.match(
    oneOff,
    /const runRevision = huntConfigurationRevisionRef\.current/,
  );
  assert.match(
    oneOff,
    /if \(huntConfigurationRevisionRef\.current === runRevision\) \{[\s\S]*?localStorage\.removeItem\("jobhuntr-new-run-draft"\)/,
  );
  assert.match(recurring, /runningRef\.current/);
  assert.match(
    recurring,
    /const runRevision = huntConfigurationRevisionRef\.current/,
  );
  assert.match(
    recurring,
    /if \(huntConfigurationRevisionRef\.current === runRevision\) \{[\s\S]*?localStorage\.removeItem\("jobhuntr-new-run-draft"\)/,
  );
  assert.match(recurring, /api\("\/api\/infinite-hunt\/start-run"/);
  assert.doesNotMatch(recurring, /api\("\/api\/infinite-hunt\/start"/);
  assert.doesNotMatch(recurring, /schedule\?\.generation/);
  assert.match(agent, /const stoppingInfiniteRef = useRef\(false\)/);
  const stopping = agent.slice(
    agent.indexOf("const stopInfiniteHunt = async"),
    agent.indexOf("const previewMatches"),
  );
  assert.match(
    stopping,
    /if \(runningRef\.current \|\| stoppingInfiniteRef\.current\) return/,
  );
  assert.match(stopping, /stoppingInfiniteRef\.current = true/);
  assert.match(
    stopping,
    /finally \{\s*stoppingInfiniteRef\.current = false;\s*setStoppingInfinite\(false\)/,
  );
  assert.match(agent, /aria-busy=\{stoppingInfinite\}/);
  assert.match(agent, /stoppingInfinite \? "Stopping…" : "Stop Infinite Hunt"/);
  assert.match(agent, /const huntConfigurationRevisionRef = useRef\(0\)/);
  assert.match(
    agent,
    /const markHuntConfigurationEdited = \(\) => \{[\s\S]*?huntConfigurationRevisionRef\.current \+= 1;[\s\S]*?setPresetSaved\(false\)/,
  );
  const savePreset = agent.slice(
    agent.indexOf("const savePreset = async"),
    agent.indexOf("const workflows = HUNT_WORKFLOWS"),
  );
  assert.match(
    savePreset,
    /const savingRevision = huntConfigurationRevisionRef\.current/,
  );
  assert.match(
    savePreset,
    /if \(huntConfigurationRevisionRef\.current === savingRevision\)\s*setPresetSaved\(true\)/,
  );
  const previewMatches = agent.slice(
    agent.indexOf("const previewMatches = async"),
    agent.indexOf("const savePreset = async"),
  );
  assert.match(
    previewMatches,
    /const previewRevision = huntConfigurationRevisionRef\.current/,
  );
  assert.match(
    previewMatches,
    /if \(huntConfigurationRevisionRef\.current === previewRevision\)\s*setPreview\(result\)/,
  );
  assert.match(
    agent,
    /const markHuntConfigurationEdited = \(\) => \{[\s\S]*?setPreview\(null\)/,
  );
});

test("Infinite Hunt recovers a bounded complete configuration draft", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const agent = source.slice(
    source.indexOf("function Agent"),
    source.indexOf("function RunsPage"),
  );

  assert.match(agent, /jobhuntr-new-run-draft/);
  assert.match(agent, /String\(saved\.q \|\| ""\)\.slice\(0, 500\)/);
  assert.match(agent, /normalizeHuntWorkflows\(saved\.workflows\)/);
  assert.match(agent, /intervalMinutes: Number\(intervalMinutes\)/);
  assert.match(agent, /requiredKeywords: form\.required/);
  assert.match(agent, /excludeKeywords: form\.excluded/);
  assert.match(agent, /Unsaved Infinite Hunt configuration restored\./);
  assert.match(agent, /if \(!huntDraftTouched\) return/);
  assert.match(agent, /setHuntDraftTouched\(false\)/);
  assert.match(agent, /draggable/);
  assert.match(
    agent,
    /className="v2-loop-drag-handle"[\s\S]*?aria-hidden="true"/,
  );
  assert.match(agent, /onDragStart=\{\(event\) =>/);
  assert.match(agent, /onDrop=\{\(event\) =>/);
  assert.match(
    agent,
    /const dropRunBefore = \(targetId, transferredId = ""\) =>/,
  );
  assert.match(agent, /const targetIndex = selectedRuns\.indexOf\(targetId\)/);
  assert.match(agent, /Math\.min\(targetIndex, next\.length\)/);
  assert.match(agent, /role="status" aria-live="polite"/);
});

test("application packet actions are single-flight with truthful progress", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const queue = source.slice(
    source.indexOf("function Queue("),
    source.indexOf("function ClipboardListIcon"),
  );

  assert.match(queue, /const creatingPacketRef = useRef\(false\)/);
  assert.match(queue, /const submittingReadyRef = useRef\(false\)/);
  assert.match(
    queue,
    /if \(!selectedQueueJobId \|\| creatingPacketRef\.current\) return/,
  );
  assert.match(
    queue,
    /if \(!targetJobId \|\| creatingPacketRef\.current\) return/,
  );
  assert.match(queue, /submittingReadyRef\.current[\s\S]*?return/);
  assert.match(queue, /creatingPacketRef\.current = true/);
  assert.match(queue, /creatingPacketRef\.current = false/);
  assert.match(queue, /submittingReadyRef\.current = true/);
  assert.match(queue, /submittingReadyRef\.current = false/);
  assert.match(queue, /"Preparing…"[\s\S]*?: "Prepare application"/);
  assert.match(queue, /"Adding…"[\s\S]*?: "Add to queue"/);
  assert.match(queue, /aria-busy=\{submittingReady\}/);
  const archive = queue.slice(
    queue.indexOf('title="Archive filtered queue jobs?"'),
    queue.indexOf('<div className="v2-queue-title-row">'),
  );
  assert.match(archive, /api\("\/api\/submissions\/archive"/);
  assert.match(archive, /ids: filtered\.map\(\(item\) => item\.id\)/);
  assert.doesNotMatch(archive, /Promise\.all/);
});

test("confirmation dialogs reject duplicate actions and report truthful work", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const dialog = source.slice(
    source.indexOf("function ConfirmDialog"),
    source.indexOf("function InfiniteHuntStatus"),
  );
  const tracker = source.slice(
    source.indexOf("function Tracker"),
    source.indexOf("function TrackerApplicationInsights"),
  );

  assert.match(dialog, /busyLabel = "Deleting…"/);
  assert.match(dialog, /if \(busyRef\.current\) return/);
  assert.match(dialog, /busyRef\.current = true/);
  assert.match(dialog, /finally \{\s*busyRef\.current = false/);
  assert.match(dialog, /aria-busy=\{busy\}/);
  assert.match(dialog, /busy \? busyLabel : confirmLabel/);
  assert.match(tracker, /busyLabel="Recording…"/);
  assert.match(tracker, /if \(!saved\) throw new Error/);
  assert.doesNotMatch(
    tracker,
    /onConfirm=\{async \(\) => \{\s*const id = pendingAppliedJobId;\s*setPendingAppliedJobId\(""\)/,
  );
  assert.match(
    source,
    /confirmLabel="Archive packets"\s*busyLabel="Archiving…"/,
  );
});

test("Job Tracker saves cannot duplicate or dismiss in-flight work", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const tracker = source.slice(
    source.indexOf("function Tracker"),
    source.indexOf("function TrackerApplicationInsights"),
  );

  for (const action of ["editBusy", "addBusy"]) {
    assert.match(tracker, new RegExp(`const ${action}Ref = useRef\\(false\\)`));
    assert.match(tracker, new RegExp(`${action}Ref\\.current = true`));
    assert.match(tracker, new RegExp(`${action}Ref\\.current = false`));
    assert.match(tracker, new RegExp(`aria-busy=\\{${action}\\}`));
  }
  assert.match(tracker, /editBusyRef\.current[\s\S]*?return/);
  assert.match(tracker, /addBusyRef\.current\)\s*return/);
  assert.match(
    tracker,
    /if \(editBusyRef\.current \|\| discardTrackerEdit\) return/,
  );
  assert.match(tracker, /requestCloseJobDrawerRef\.current\(\)/);
  assert.match(tracker, /requestCloseNewJobRef\.current\(\)/);
  assert.match(tracker, /addBusy \? "Saving…" : "Save"/);
  assert.match(tracker, /disabled=\{addBusy\}/);
  assert.match(tracker, /const movingJobIdsRef = useRef\(new Set\(\)\)/);
  assert.match(tracker, /movingJobIdsRef\.current\.has\(id\)/);
  assert.match(tracker, /movingJobIdsRef\.current\.add\(id\)/);
  assert.match(tracker, /movingJobIdsRef\.current\.delete\(id\)/);
  assert.match(tracker, /draggable=\{!movingJobIds\.has\(item\.id\)\}/);
  assert.match(tracker, /disabled=\{movingJobIds\.has\(job\.id\)\}/);
});

test("Job Tracker protects unsaved edits from every dismissal path", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const tracker = source.slice(
    source.indexOf("function Tracker"),
    source.indexOf("function TrackerApplicationInsights"),
  );

  assert.match(tracker, /const \[editFormBaseline, setEditFormBaseline\]/);
  assert.match(tracker, /const hasUnsavedTrackerEdit = Boolean/);
  assert.match(tracker, /title="Discard job changes\?"/);
  assert.match(tracker, /onClick=\{requestCancelTrackerEdit\}/);
  assert.match(tracker, /onClick=\{requestCloseJobDrawer\}/);
  assert.match(tracker, /requestCloseJobDrawerRef\.current\(\)/);
  assert.match(
    tracker,
    /finishClosingTrackerEdit\(discardTrackerEdit === "drawer"\)/,
  );
});

test("Job Tracker protects unsaved new roles from every dismissal path", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const tracker = source.slice(
    source.indexOf("function Tracker"),
    source.indexOf("function TrackerApplicationInsights"),
  );

  assert.match(tracker, /const \[newJobBaseline, setNewJobBaseline\]/);
  assert.match(tracker, /const hasUnsavedNewJob = Boolean/);
  assert.match(tracker, /title="Discard new job\?"/);
  assert.match(tracker, /onClick=\{requestCloseNewJob\}/);
  assert.match(tracker, /requestCloseNewJobRef\.current\(\)/);
  assert.match(tracker, /onConfirm=\{finishClosingNewJob\}/);
  assert.match(tracker, /onClick=\{\(\) => openNewJob\(stage\)\}/);
});

test("Agent Runs bulk deletion uses one atomic retryable request", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const runs = source.slice(
    source.indexOf("function RunsPage"),
    source.indexOf("function SettingsPage"),
  );
  const deletion = runs.slice(
    runs.indexOf("const deleteRuns = async"),
    runs.indexOf("useEffect", runs.indexOf("const deleteRuns = async")),
  );

  assert.match(deletion, /await api\("\/api\/agent-runs\/delete"/);
  assert.match(deletion, /JSON\.stringify\(\{ ids: deleteIds \}\)/);
  assert.doesNotMatch(deletion, /Promise\.all/);
  assert.doesNotMatch(deletion, /setDeleteIds\(\[\]\)[\s\S]*?await api/);
});

test("Resume Studio document writes are single-flight and keep editors retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const studio = source.slice(
    source.indexOf("function Resume("),
    source.indexOf("function OutreachPage"),
  );

  for (const action of [
    "savingTemplate",
    "generatingLetter",
    "finishingLetter",
    "savingLetter",
  ]) {
    assert.match(studio, new RegExp(`const ${action}Ref = useRef\\(false\\)`));
    assert.match(studio, new RegExp(`${action}Ref\\.current = true`));
    assert.match(studio, new RegExp(`${action}Ref\\.current = false`));
    assert.match(studio, new RegExp(`aria-busy=\\{${action}\\}`));
  }
  assert.match(studio, /if \(templateOperationRef\.current\) return/);
  assert.match(studio, /if \(generatingLetterRef\.current\) return/);
  assert.match(studio, /finishingLetterRef\.current\) return/);
  assert.match(studio, /savingLetterRef\.current\) return/);
  assert.match(studio, /"Generating…" : "Generate Cover Letter"/);
  assert.match(studio, /"Saving template…" : "Complete Template"/);
  assert.match(studio, /Escape" && !templateOperationRef\.current/);
  assert.match(
    studio,
    /savingTemplate \|\| templateDialog\?\.scoring \|\| templateDialog\?\.extractingFile/,
  );
  assert.match(studio, /disabled=\{templateDialogBusy\}/);
  assert.match(studio, /disabled=\{coverWizardBusy\}/);
  assert.match(
    studio,
    /!generatingLetterRef\.current && !finishingLetterRef\.current/,
  );
});

test("all authoritative cover-letter templates retain distinct visual themes", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const themeSource = source.slice(
    source.indexOf("const COVER_LETTER_PREVIEW_THEMES"),
    source.indexOf("const coverLetterPreviewDocument"),
  );
  const templateIds = [
    "blank",
    "minimal",
    "professional",
    "modern",
    "creative",
    "tech-startup",
    "finance",
    "healthcare",
    "marketing",
    "education",
    "legal",
    "engineering",
    "sales",
    "nonprofit",
    "consulting",
    "startup",
  ];

  for (const id of templateIds) {
    const key = id.includes("-") ? `"${id}":` : `${id}:`;
    assert.match(themeSource, new RegExp(key.replace("-", "\\-")));
    assert.match(
      styles,
      new RegExp(`v2-cover-template-(?:sheet|strip)[\\s\\S]*?\\.${id}`),
    );
  }
  assert.match(source, /background:\$\{theme\.surface\}/);
  assert.match(source, /font:15px\/1\.7 \$\{theme\.font\}/);
  assert.match(source, /border-left:\$\{theme\.edge\}/);
  assert.match(
    source,
    /className=\{`v2-letter-paper \$\{item\.templateId \|\| "minimal"\}`\}/,
  );
  assert.match(source, /"--letter-accent": theme\.accent/);
  assert.match(source, /item\.templateName \|\|/);
  assert.match(styles, /border-left: var\(--letter-edge\)/);
  assert.match(styles, /background: var\(--letter-surface\)/);
  assert.match(styles, /font-family: var\(--letter-font\)/);
});

test("saved cover letters retain a safe themed live editing workspace", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /title="Saved Cover Letter Preview"/);
  assert.match(source, /sandbox=""/);
  assert.match(
    source,
    /coverLetterPreviewDocument\(\s*letter\.body,\s*letter\.templateId/,
  );
  assert.match(styles, /\.v2-letter-editor-split\s*\{/);
  assert.match(
    styles,
    /grid-template-columns: minmax\(320px, 0\.82fr\) minmax\(420px, 1\.18fr\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.v2-letter-editor-split/,
  );
  assert.match(source, /const \[savedLetterSnapshot, setSavedLetterSnapshot\]/);
  assert.match(source, /const hasUnsavedLetterChanges = Boolean/);
  assert.match(source, /title="Discard unsaved changes\?"/);
  assert.match(
    source,
    /disabled=\{savingLetter \|\| !hasUnsavedLetterChanges\}/,
  );
  assert.match(source, /const SAVED_LETTER_DRAFT_KEY/);
  assert.match(source, /const readSavedLetterDraft/);
  assert.match(source, /baselineUpdatedAt/);
  assert.match(source, /clearSavedLetterDraft\(\)/);
});

test("ATS template editing protects meaningful unsaved wizard changes", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const templateDialogDigest =/);
  assert.match(source, /const hasUnsavedTemplateChanges = Boolean/);
  assert.match(source, /title="Discard template changes\?"/);
  assert.match(source, /onClick=\{closeTemplateDialog\}/);
  assert.match(
    source,
    /templateDialog\.step === 1\s*\? closeTemplateDialog\(\)/,
  );
  assert.match(source, /const ATS_TEMPLATE_DRAFT_KEY/);
  assert.match(source, /const readTemplateDialogDraft/);
  assert.match(source, /sourceUpdatedAt/);
  assert.match(source, /raw\.length > 350000/);
  assert.match(source, /clearTemplateDialogDraft\(\)/);
});

test("submission recording locks every modal dismiss path while in flight", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const queue = source.slice(
    source.indexOf("function Queue("),
    source.indexOf("function ClipboardListIcon"),
  );
  assert.match(queue, /const resetSubmitAssist = useCallback/);
  assert.match(queue, /if \(submittingReadyRef\.current\) return/);
  assert.match(queue, /requestCloseSubmitAssist\(\)/);
  assert.match(
    queue,
    /disabled=\{submittingReady\}[\s\S]*?onClick=\{requestCloseSubmitAssist\}/,
  );
});

test("Job Board queueing uses one atomic backend operation", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const board = source.slice(
    source.indexOf("function Board("),
    source.indexOf("function Queue("),
  );
  assert.match(board, /api\("\/api\/board\/queue"/);
  assert.doesNotMatch(
    board.slice(
      board.indexOf("const queueJob"),
      board.indexOf("const clearFilters"),
    ),
    /api\("\/api\/(?:jobs|submissions)"/,
  );
  assert.match(board, /submittedJobIds\.has\(job\.id\)/);
});

test("Gig details cannot close while their serialized mutation queue is active", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const gigs = source.slice(
    source.indexOf("function Gigs("),
    source.indexOf("function ProfileAudit"),
  );
  assert.match(gigs, /const gigDetailsBusyRef = useRef/);
  assert.match(gigs, /if \(gigDetailsBusyRef\.current\) return/);
  assert.match(
    gigs,
    /disabled=\{gigDetailsBusy\}[\s\S]*?onClick=\{closeGigDetails\}/,
  );
  assert.match(gigs, /event\.key === "Escape"[\s\S]*?closeGigDetails\(\)/);
  assert.match(gigs, /returnFocus\?\.focus\?\.\(\)/);
});

test("Outreach collection and recording cannot duplicate or dismiss in-flight work", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const outreach = source.slice(
    source.indexOf("function OutreachPage"),
    source.indexOf("function Coach"),
  );

  for (const action of ["collecting", "connecting"]) {
    assert.match(
      outreach,
      new RegExp(`const ${action}Ref = useRef\\(false\\)`),
    );
    assert.match(outreach, new RegExp(`${action}Ref\\.current = true`));
    assert.match(outreach, new RegExp(`${action}Ref\\.current = false`));
    assert.match(outreach, new RegExp(`aria-busy=\\{${action}\\}`));
    assert.match(outreach, new RegExp(`Escape" && !${action}Ref\\.current`));
    assert.match(outreach, new RegExp(`disabled=\\{${action}\\}`));
  }
  assert.match(outreach, /if \(collectingRef\.current\) return false/);
  assert.match(
    outreach,
    /if \(connectingRef\.current \|\| !selectedIds\.size\) return/,
  );
  assert.match(outreach, /collecting \? "Collecting…" : "Collect contacts"/);
  assert.match(outreach, /connecting \? "Recording…" : "Mark as outreached"/);
  const bulkRecord = outreach.slice(
    outreach.indexOf("const markSelectedOutreached = async"),
    outreach.indexOf(
      "return (",
      outreach.indexOf("const markSelectedOutreached = async"),
    ),
  );
  assert.match(bulkRecord, /api\("\/api\/outreach\/bulk-status"/);
  assert.match(bulkRecord, /ids: \[\.\.\.selectedIds\], status: "sent"/);
  assert.doesNotMatch(bulkRecord, /Promise\.all/);
});

test("Career Coach generation actions are single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const coach = source.slice(
    source.indexOf("function Coach"),
    source.indexOf("function PracticeSession"),
  );

  for (const action of [
    "coachResponding",
    "preparingSession",
    "generatingOutreach",
  ]) {
    assert.match(coach, new RegExp(`const ${action}Ref = useRef\\(false\\)`));
    assert.match(coach, new RegExp(`${action}Ref\\.current = true`));
    assert.match(coach, new RegExp(`${action}Ref\\.current = false`));
    assert.match(coach, new RegExp(`aria-busy=\\{${action}\\}`));
  }
  assert.match(coach, /if \(preparingSessionRef\.current\) return/);
  assert.match(coach, /if \(generatingOutreachRef\.current\) return/);
  assert.match(coach, /if \(!prompt \|\| coachRespondingRef\.current\) return/);
  assert.match(
    coach,
    /preparingSession \? "Preparing…" : "New role-specific plan"/,
  );
  assert.match(
    coach,
    /generatingOutreach \? "Drafting…" : "Draft for selected role"/,
  );
});

test("Career Coach recovers bounded unsent composer drafts", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const coach = source.slice(
    source.indexOf("function Coach"),
    source.indexOf("function PracticeSession"),
  );

  assert.match(coach, /jobhuntr-coach-composer-draft/);
  assert.match(coach, /localStorage\.getItem\(coachComposerDraftKey\)/);
  assert.match(coach, /String\(saved\?\.content \|\| ""\)\.slice\(0, 10_000\)/);
  assert.match(coach, /localStorage\.setItem\(/);
  assert.match(coach, /localStorage\.removeItem\(coachComposerDraftKey\)/);
  assert.match(coach, /Unsent coaching prompt restored\./);
  assert.doesNotMatch(
    coach,
    /const newConversation = \(\) => \{\s*setChatInput\(""\)/,
  );
});

test("Career Coach evidence saves are single-flight and preserve retry context", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const practice = source.slice(
    source.indexOf("function PracticeSession"),
    source.indexOf("function StoryVault"),
  );
  const stories = source.slice(
    source.indexOf("function StoryVault"),
    source.indexOf("function OutreachEditor"),
  );

  assert.match(practice, /const savingPracticeRef = useRef\(false\)/);
  assert.match(practice, /if \(savingPracticeRef\.current\) return/);
  assert.match(practice, /savingPracticeRef\.current = true/);
  assert.match(practice, /savingPracticeRef\.current = false/);
  assert.match(practice, /aria-busy=\{savingPractice\}/);
  assert.match(practice, /savingPractice \? "Saving…" : "Save progress"/);

  assert.match(stories, /const savingStoryRef = useRef\(false\)/);
  assert.match(stories, /if \(savingStoryRef\.current\) return/);
  assert.match(stories, /savingStoryRef\.current = true/);
  assert.match(stories, /savingStoryRef\.current = false/);
  assert.match(stories, /aria-busy=\{savingStory\}/);
  assert.match(stories, /savingStory\s*\? "Saving…"/);
});

test("Career Coach protects unsaved interview practice during navigation", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const coach = source.slice(
    source.indexOf("function Coach"),
    source.indexOf("function PracticeSession"),
  );
  const practice = source.slice(
    source.indexOf("function PracticeSession"),
    source.indexOf("function StoryVault"),
  );

  assert.match(coach, /const \[practiceBaseline, setPracticeBaseline\]/);
  assert.match(coach, /const hasUnsavedPractice = Boolean/);
  assert.match(coach, /title="Discard practice changes\?"/);
  assert.match(coach, /requestPracticeNavigation\(\{ type: "prepare" \}\)/);
  assert.match(
    coach,
    /requestPracticeNavigation\(\{ type: "session", id: item\.id \}\)/,
  );
  assert.match(
    coach,
    /setPracticeBaseline\(practiceSessionDigest\(updated\)\)/,
  );
  assert.match(practice, /onSaved\(updated\)/);
});

test("Career Coach protects unsaved STAR evidence during navigation", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const stories = source.slice(
    source.indexOf("function StoryVault"),
    source.indexOf("function OutreachEditor"),
  );

  assert.match(stories, /const \[storyBaseline, setStoryBaseline\]/);
  assert.match(
    stories,
    /const hasUnsavedStory = storyDigest\(form\) !== storyBaseline/,
  );
  assert.match(stories, /title="Discard STAR story changes\?"/);
  assert.match(
    stories,
    /onConfirm=\{\(\) => finishStoryNavigation\(pendingStoryId\)\}/,
  );
  assert.match(
    stories,
    /onClick=\{\(\) => requestStoryNavigation\(story\.id\)\}/,
  );
  assert.match(stories, /onClick=\{\(\) => requestStoryNavigation\(\)\}/);
});

test("Outreach draft edits cannot race an in-flight save", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const editor = source.slice(
    source.indexOf("function OutreachEditor"),
    source.indexOf("function Gigs"),
  );

  assert.match(editor, /const savingDraftRef = useRef\(false\)/);
  assert.match(editor, /if \(savingDraftRef\.current\) return/);
  assert.match(editor, /savingDraftRef\.current = true/);
  assert.match(editor, /savingDraftRef\.current = false/);
  assert.match(editor, /aria-busy=\{savingDraft\}/);
  assert.match(editor, /savingDraft \? "Saving…" : "Save locally"/);
  assert.ok(
    (editor.match(/disabled=\{savingDraft\}/g) || []).length >= 4,
    "status, subject, message, and save controls must lock together",
  );
});

test("Outreach contact navigation protects unsaved message edits", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const outreach = source.slice(
    source.indexOf("function OutreachPage"),
    source.indexOf("function Coach"),
  );

  assert.match(outreach, /const \[draftBaseline, setDraftBaseline\]/);
  assert.match(outreach, /const hasUnsavedOutreachDraft = Boolean/);
  assert.match(outreach, /title="Discard outreach changes\?"/);
  assert.match(
    outreach,
    /onClick=\{\(\) => requestSelectContact\(item\.id\)\}/,
  );
  assert.match(outreach, /onSaved=\{\(updated\) =>/);
  assert.match(outreach, /setDraftBaseline\(outreachDraftDigest\(updated\)\)/);
});

test("Gig creation and applications are single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const gigs = source.slice(
    source.indexOf("function Gigs"),
    source.indexOf("function ProfileAudit"),
  );

  for (const action of ["savingGig", "applyingGig"]) {
    assert.match(gigs, new RegExp(`const ${action}Ref = useRef\\(false\\)`));
    assert.match(gigs, new RegExp(`${action}Ref\\.current = true`));
    assert.match(gigs, new RegExp(`${action}Ref\\.current = false`));
    assert.match(gigs, new RegExp(`aria-busy=\\{${action}\\}`));
  }
  assert.match(gigs, /if \(savingGigRef\.current\) return/);
  assert.match(gigs, /if \(!item \|\| applyingGigRef\.current\) return/);
  assert.match(gigs, /requestCloseCampaignRef\.current\(\)/);
  assert.match(gigs, /applyingGig \? "Submitting…" : "Submit Application"/);
  assert.match(gigs, /savingGig \? "Saving…" : "Save gig"/);
  assert.ok(
    (gigs.match(/disabled=\{savingGig\}/g) || []).length >= 3,
    "gig fields and close action must lock while creation is pending",
  );
  assert.match(gigs, /const gigMutationQueuesRef = useRef\(new Map\(\)\)/);
  assert.match(
    gigs,
    /const previous = gigMutationQueuesRef\.current\.get\(id\)/,
  );
  assert.match(gigs, /previous[\s\S]*?\.catch\(\(\) => false\)[\s\S]*?\.then/);
  assert.match(gigs, /gigMutationQueuesRef\.current\.set\(id, operation\)/);
  assert.match(gigs, /gigMutationQueuesRef\.current\.get\(id\) !== operation/);
  assert.match(gigs, /draggable=\{!patchingGigIds\.has\(item\.id\)\}/);
});

test("Gig application pitches cannot be silently dismissed", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const gigs = source.slice(
    source.indexOf("function Gigs"),
    source.indexOf("function ProfileAudit"),
  );

  assert.match(gigs, /const \[discardCampaignOpen, setDiscardCampaignOpen\]/);
  assert.match(gigs, /if \(campaignProposal\.trim\(\)\)/);
  assert.match(gigs, /title="Discard application pitch\?"/);
  assert.match(gigs, /onConfirm=\{finishClosingCampaign\}/);
  assert.match(gigs, /requestCloseCampaignRef\.current\(\)/);
  assert.ok(
    (gigs.match(/onClick=\{requestCloseCampaign\}/g) || []).length >= 2,
    "the backdrop and Cancel action must share protected dismissal behavior",
  );
  assert.match(gigs, /jobhuntr-gig-application-pitch-draft/);
  assert.match(gigs, /localStorage\.getItem\(gigPitchDraftKey\)/);
  assert.match(gigs, /String\(saved\.proposal\)\.slice\(0, 10_000\)/);
  assert.match(gigs, /Unsaved gig application pitch restored\./);
  assert.match(
    gigs,
    /localStorage\.setItem\([\s\S]*?gigPitchDraftKey,[\s\S]*?proposal: campaignProposal/,
  );
});

test("new gig drafts recover after navigating away", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const gigs = source.slice(
    source.indexOf("function Gigs"),
    source.indexOf("function ProfileAudit"),
  );

  assert.match(gigs, /jobhuntr-new-gig-draft/);
  assert.match(gigs, /localStorage\.getItem\(gigDraftKey\)/);
  assert.match(
    gigs,
    /localStorage\.setItem\(gigDraftKey, JSON\.stringify\(form\)\)/,
  );
  assert.match(gigs, /localStorage\.removeItem\(gigDraftKey\)/);
  assert.match(gigs, /Unsaved gig opportunity draft restored\./);
  assert.match(
    gigs,
    /String\(saved\.description \|\| ""\)\.slice\(0, 10_000\)/,
  );
});

test("LinkedIn audits cannot duplicate or publish stale results", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const audit = source.slice(
    source.indexOf("function ProfileAudit"),
    source.indexOf("function Agent"),
  );

  assert.match(audit, /const runningAuditRef = useRef\(false\)/);
  assert.match(audit, /const profileRevision = useRef\(0\)/);
  assert.match(audit, /if \(runningAuditRef\.current\) return/);
  assert.match(audit, /runningAuditRef\.current = true/);
  assert.match(audit, /runningAuditRef\.current = false/);
  assert.match(audit, /const auditRevision = profileRevision\.current/);
  assert.match(
    audit,
    /if \(profileRevision\.current === auditRevision\) \{\s*setAudit\(result\)/,
  );
  assert.match(audit, /const editProfileUrl = \(value\) => \{/);
  assert.match(audit, /const editAuditForm = \(next\) => \{/);
  assert.ok(
    (audit.match(/profileRevision\.current \+= 1/g) || []).length >= 3,
    "URL edits, form edits, and history selection must invalidate pending audits",
  );
  assert.match(audit, /aria-busy=\{running\}/);
});

test("LinkedIn Audit recovers bounded private profile drafts", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const audit = source.slice(
    source.indexOf("function ProfileAudit"),
    source.indexOf("function Agent"),
  );

  assert.match(audit, /jobhuntr-profile-audit-draft/);
  assert.match(audit, /localStorage\.getItem\(auditDraftKey\)/);
  assert.match(audit, /localStorage\.setItem\(/);
  assert.match(audit, /localStorage\.removeItem\(auditDraftKey\)/);
  assert.match(audit, /Private LinkedIn audit draft restored\./);
  assert.match(
    audit,
    /String\(saved\.experience \|\| ""\)\.slice\(0, 50_000\)/,
  );
  assert.match(audit, /persistAuditDraft\(profileUrl, next\)/);
});

test("Interview round persistence is single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const rounds = source.slice(
    source.indexOf("function InterviewRounds"),
    source.indexOf("function Actions"),
  );

  assert.match(rounds, /const busyRef = useRef\(false\)/);
  assert.match(rounds, /if \(busyRef\.current\) return false/);
  assert.match(rounds, /busyRef\.current = true/);
  assert.match(rounds, /busyRef\.current = false/);
  assert.match(rounds, /return true/);
  assert.match(rounds, /return false/);
  assert.match(rounds, /if \(!removed\) throw new Error/);
  assert.match(rounds, /aria-busy=\{busy\}/);
  assert.ok(
    (rounds.match(/disabled=\{busy\}/g) || []).length >= 3,
    "cancel, edit, and delete controls must lock during persistence",
  );
});

test("Interview round drafts recover after the Job Tracker drawer closes", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const rounds = source.slice(
    source.indexOf("function InterviewRounds"),
    source.indexOf("function Actions"),
  );

  assert.match(rounds, /jobhuntr-interview-round-draft:/);
  assert.match(rounds, /localStorage\.getItem\(draftKey\)/);
  assert.match(rounds, /localStorage\.setItem\(/);
  assert.match(rounds, /localStorage\.removeItem\(draftKey\)/);
  assert.match(rounds, /Unsaved interview round draft restored\./);
  assert.match(rounds, /String\(saved\.notes \|\| ""\)\.slice\(0, 10_000\)/);
});

test("Job Board refresh and queue actions are single-flight", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const board = source.slice(
    source.indexOf("function Board"),
    source.indexOf("function Queue"),
  );

  assert.match(board, /const queueingRef = useRef\(""\)/);
  assert.match(board, /const searchingRef = useRef\(false\)/);
  assert.match(board, /const boardSearchRequestId = useRef\(0\)/);
  assert.match(board, /if \(searchingRef\.current\) return/);
  assert.match(board, /searchingRef\.current = true/);
  assert.match(board, /searchingRef\.current = false/);
  assert.ok(
    (board.match(/\+\+boardSearchRequestId\.current/g) || []).length >= 2,
    "initial and manual feed requests must share newest-request ordering",
  );
  assert.ok(
    (board.match(/boardSearchRequestId\.current === requestId/g) || [])
      .length >= 2,
    "initial and manual responses must reject stale feed results",
  );
  assert.match(
    board,
    /if \(!job\?\.url \|\| queueingRef\.current \|\| queuedUrls\.has\(job\.url\)\) return/,
  );
  assert.match(board, /queueingRef\.current = job\.url/);
  assert.match(board, /queueingRef\.current = ""/);
  assert.match(board, /await reload\(\)/);
  assert.match(board, /type="button"[\s\S]*?onClick=\{search\}/);
  assert.match(board, /aria-busy=\{searching\}/);
  assert.match(board, /aria-busy=\{queueing === selected\.url\}/);
  assert.match(board, /const clearFilters = async \(\) => \{/);
});

test("backup restore and CSV imports reject duplicate or stale work", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const privacy = source.slice(source.indexOf("function Privacy"));

  assert.match(privacy, /const restoringRef = useRef\(false\)/);
  assert.match(privacy, /const backupInspectionId = useRef\(0\)/);
  assert.match(privacy, /const importingCsvRef = useRef\(false\)/);
  assert.match(privacy, /if \(!backupFile \|\| restoringRef\.current\) return/);
  assert.match(privacy, /restoringRef\.current = true/);
  assert.match(privacy, /restoringRef\.current = false/);
  assert.match(privacy, /const inspectionId = \+\+backupInspectionId\.current/);
  assert.ok(
    (privacy.match(/backupInspectionId\.current === inspectionId/g) || [])
      .length >= 3,
    "only the newest backup inspection may change preview state",
  );
  assert.match(privacy, /if \(!csvFile \|\| importingCsvRef\.current\) return/);
  assert.match(privacy, /importingCsvRef\.current = true/);
  assert.match(privacy, /importingCsvRef\.current = false/);
  assert.match(privacy, /aria-busy=\{inspectingBackup\}/);
  assert.match(privacy, /aria-busy=\{importingCsv\}/);
  assert.match(privacy, /aria-busy=\{restoring\}/);
  assert.match(
    privacy,
    /!restoringRef\.current[\s\S]*?setRestoreOpen\(false\)/,
  );
});

test("Job Tracker notes, tasks, and contacts save as isolated units", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const actions = source.slice(
    source.indexOf("function Actions"),
    source.indexOf("function Board"),
  );

  for (const record of ["Note", "Task", "Contact"]) {
    const lower = record.toLowerCase();
    assert.match(
      actions,
      new RegExp(`const saving${record}Ref = useRef\\(false\\)`),
    );
    assert.match(
      actions,
      new RegExp(
        `if \\([\\s\\S]{0,120}?saving${record}Ref\\.current\\) return`,
      ),
    );
    assert.match(actions, new RegExp(`saving${record}Ref\\.current = true`));
    assert.match(actions, new RegExp(`saving${record}Ref\\.current = false`));
    assert.match(actions, new RegExp(`aria-busy=\\{saving${record}\\}`));
    assert.match(actions, new RegExp(`const save${record} = async`));
    assert.match(actions, new RegExp(`Preserve the ${lower}`));
  }
  assert.ok(
    (actions.match(/disabled=\{savingTask\}/g) || []).length >= 4,
    "task cancel/edit/delete controls must lock with the task form",
  );
  assert.ok(
    (actions.match(/disabled=\{savingContact\}/g) || []).length >= 7,
    "contact fields and conflicting controls must lock together",
  );
});

test("Job Tracker action drafts recover after its drawer closes", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const actions = source.slice(
    source.indexOf("function Actions"),
    source.indexOf("function Board"),
  );

  assert.match(actions, /jobhuntr-tracker-action-draft:/);
  assert.match(actions, /localStorage\.getItem\(actionDraftKey\)/);
  assert.match(actions, /localStorage\.setItem\(/);
  assert.match(actions, /localStorage\.removeItem\(actionDraftKey\)/);
  assert.match(actions, /Unsaved note, task, or contact draft restored\./);
  assert.match(actions, /String\(saved\.note \|\| ""\)\.slice\(0, 10_000\)/);
  assert.match(
    actions,
    /String\(saved\.contact\?\.email \|\| ""\)\.slice\(0, 320\)/,
  );
});

test("task completion toggles serialize independently per task", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const actions = source.slice(
    source.indexOf("function Actions"),
    source.indexOf("function Board"),
  );

  assert.match(actions, /const \[pendingTaskIds, setPendingTaskIds\]/);
  assert.match(actions, /const pendingTaskIdsRef = useRef\(new Set\(\)\)/);
  assert.match(
    actions,
    /if \(pendingTaskIdsRef\.current\.has\(taskId\)\) return/,
  );
  assert.match(actions, /pendingTaskIdsRef\.current\.add\(taskId\)/);
  assert.match(actions, /pendingTaskIdsRef\.current\.delete\(taskId\)/);
  assert.match(actions, /const toggleTask = async \(taskId, done\)/);
  assert.match(actions, /disabled=\{pendingTaskIds\.has\(t\.id\)\}/);
  assert.match(actions, /aria-busy=\{pendingTaskIds\.has\(t\.id\)\}/);
  assert.match(
    actions,
    /onChange=\{\(e\) => toggleTask\(t\.id, e\.target\.checked\)\}/,
  );
});

test("clipboard actions fail closed when desktop permission is unavailable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const writeClipboardText = async \(value\) => \{/);
  assert.match(source, /if \(!navigator\.clipboard\?\.writeText\)\s*throw/);
  assert.match(source, /document\.execCommand\("copy"\)/);
  assert.match(source, /catch \{\s*return false;\s*\}/);
  assert.equal(
    (source.match(/navigator\.clipboard\.writeText/g) || []).length,
    1,
    "all clipboard writes must pass through the contained helper",
  );
  assert.ok(
    (source.match(/await writeClipboardText\(/g) || []).length >= 3,
    "tracker and coach copy actions must use the safe helper",
  );
});

test("destructive workflows reject so confirmation dialogs remain retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const workflows = [
    "const remove = async",
    "const deleteConversation = async",
    "const deleteGig = async",
  ];

  for (const startNeedle of workflows) {
    const start = source.indexOf(startNeedle);
    assert.notEqual(start, -1, `${startNeedle} must exist`);
    const end = source.indexOf("\n  };", start);
    const body = source.slice(start, end);
    assert.match(body, /await api\(/);
    assert.doesNotMatch(
      body,
      /catch\s*\{\s*\}/,
      `${startNeedle} must propagate failure to ConfirmDialog`,
    );
  }
});

test("the expanded sidebar overlays instead of crushing compact desktop pages", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    styles,
    /@media \(min-width: 761px\) \{\s*\.app\.sidebar-open main/,
  );
  assert.match(
    styles,
    /@media \(min-width: 961px\) \{\s*\.app\.sidebar-open main \{\s*margin-left: 280px/,
  );
});

test("editing a saved User Center form clears its saved confirmation", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const settings = source.slice(
    source.indexOf("function SettingsPage"),
    source.indexOf("function Privacy"),
  );

  assert.match(
    settings,
    /const markFormDirty = \(\) => \{[\s\S]*?setSaved\(false\);[\s\S]*?const editForm = \(next\) => \{\s*markFormDirty\(\);\s*setForm\(next\);/,
  );
  assert.match(
    settings,
    /name=\{`profile-\$\{key\}`\}[\s\S]*?onChange=[\s\S]*?editForm\(/,
  );
  for (const control of [
    "profile-career-context",
    "settings-target-roles",
    "settings-ats-threshold",
    "settings-remote-roles",
  ]) {
    const start = settings.indexOf(`name="${control}"`);
    assert.notEqual(start, -1, `${control} must exist`);
    assert.match(
      settings.slice(start, start + 700),
      /onChange=[\s\S]*?editForm\(/,
      `${control} must invalidate the saved notice when edited`,
    );
  }
});

test("User Center saves are single-flight and cannot bless newer edits", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const settings = source.slice(
    source.indexOf("function SettingsPage"),
    source.indexOf("function Privacy"),
  );

  assert.match(settings, /const \[savingProfile, setSavingProfile\]/);
  assert.match(settings, /const formRevision = useRef\(0\)/);
  assert.match(settings, /formRevision\.current \+= 1/);
  assert.match(settings, /const savingProfileRef = useRef\(false\)/);
  assert.match(settings, /savingProfileRef\.current = true/);
  assert.match(
    settings,
    /if \(savingProfileRef\.current \|\| extractingProfileResumeRef\.current\) return/,
  );
  assert.match(
    settings,
    /if \(formRevision\.current === savingRevision\) \{[\s\S]*?setSaved\(true\)/,
  );
  assert.match(
    settings,
    /finally \{\s*savingProfileRef\.current = false;\s*setSavingProfile\(false\)/,
  );
  assert.match(settings, /aria-busy=\{savingProfile\}/);
  assert.match(settings, /const extractingProfileResumeRef = useRef\(false\)/);
  assert.match(settings, /extractingProfileResumeRef\.current = true/);
  assert.match(settings, /extractingProfileResumeRef\.current = false/);
  assert.match(
    settings,
    /disabled=\{form\.extractingResume \|\| savingProfile\}/,
  );
});

test("private User Center edits recover until a profile save succeeds", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const settings = source.slice(
    source.indexOf("const USER_CENTER_DRAFT_KEY"),
    source.indexOf("function Privacy"),
  );

  assert.match(
    settings,
    /USER_CENTER_DRAFT_KEY = "jobhuntr-user-center-draft"/,
  );
  assert.match(settings, /function readUserCenterDraft\(profile\)/);
  assert.match(
    settings,
    /draft\._profileRevision !== userCenterProfileRevision\(profile\)/,
  );
  assert.match(settings, /setFormDirty\(true\)/);
  assert.match(
    settings,
    /if \(!formDirty\) return;[\s\S]*?localStorage\.setItem\(\s*USER_CENTER_DRAFT_KEY/,
  );
  assert.match(
    settings,
    /if \(formRevision\.current === savingRevision\) \{[\s\S]*?localStorage\.removeItem\(USER_CENTER_DRAFT_KEY\);[\s\S]*?setFormDirty\(false\)/,
  );
  assert.match(settings, /Private User Center draft restored\./);
  assert.match(settings, /text\(key, 100000\)/);
  assert.match(settings, /draft\.faqAnswers\.slice\(0, 100\)/);
});

test("external submission recording is single-flight and retryable", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const submission = source.slice(
    source.indexOf("function SubmissionCard"),
    source.indexOf("function ResumeStudioPage"),
  );

  assert.match(submission, /const recordingSubmissionRef = useRef\(false\)/);
  assert.match(
    submission,
    /if \(\s*recordingSubmissionRef\.current[\s\S]*?\)\s*return;/,
  );
  assert.match(submission, /recordingSubmissionRef\.current = true/);
  assert.match(
    submission,
    /finally \{\s*recordingSubmissionRef\.current = false;\s*setRecordingSubmission\(false\)/,
  );
  assert.match(submission, /await packetUpdateQueue\.current\.catch/);
  assert.match(submission, /aria-busy=\{recordingSubmission\}/);
  assert.match(submission, /recordingSubmission\s*\? "Recording…"/);
  assert.match(
    submission,
    /catch \{\s*\/\/ Preserve the user's explicit verification/,
  );
});

test("Easy Apply text answers recover until a packet write succeeds", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const card = source.slice(
    source.indexOf("function SubmissionCard"),
    source.indexOf("function Resume"),
  );

  assert.match(card, /jobhuntr-application-answer-draft:/);
  assert.match(card, /localStorage\.getItem\(answerDraftKey\)/);
  assert.match(card, /String\(answer \|\| ""\)\.slice\(0, 10_000\)/);
  assert.match(
    card,
    /\(question\.options \|\| \[\]\)\.includes\(String\(answer\)\)/,
  );
  assert.match(card, /const \[dirtyAnswerIds, setDirtyAnswerIds\]/);
  assert.match(card, /const answerRevisionRef = useRef\(\{\}\)/);
  assert.match(card, /const \[answerRevisions, setAnswerRevisions\]/);
  assert.match(
    card,
    /answerRevisionRef\.current\[question\.id\] = nextRevision;[\s\S]*?setAnswerRevisions/,
  );
  assert.match(
    card,
    /saved && \(answerRevisionRef\.current\[id\] \|\| 0\) === savingRevision/,
  );
  assert.match(
    card,
    /const updateQuestion = async \(id, answer, trackDraft = false\)/,
  );
  assert.match(card, /updateQuestion\(question\.id, option, true\)/);
  assert.match(
    card,
    /updateQuestion\(question\.id, event\.target\.value, true\)/,
  );
  assert.match(
    card,
    /value=\{draftAnswers\[question\.id\] \?\? question\.answer \?\? ""\}/,
  );
  assert.match(card, /if \(!dirtyAnswerIds\.size\)/);
  assert.match(
    card,
    /return \(await update\.catch\(\(\) => false\)\) === true/,
  );
  assert.match(card, /next\.delete\(id\)/);
  assert.match(card, /Unsaved application answers restored for review\./);
  assert.match(card, /const \[checklistAnswers, setChecklistAnswers\]/);
  assert.match(card, /const \[pendingChecklistIds, setPendingChecklistIds\]/);
  assert.match(card, /const checklistRevisionRef = useRef\(\{\}\)/);
  assert.match(
    card,
    /pendingChecklistIds\.has\(item\.id\)[\s\S]*?\? checklistAnswers\[item\.id\][\s\S]*?: item\.done/,
  );
  assert.match(
    card,
    /setChecklistAnswers\(\(current\) => \(\{ \.\.\.current, \[id\]: done \}\)\)/,
  );
  assert.match(card, /if \(!saved\) \{[\s\S]*?Boolean\(persisted\?\.done\)/);
  assert.match(card, /disabled=\{pendingChecklistIds\.has\(item\.id\)\}/);
  assert.match(card, /pendingChecklistIds\.size > 0/);
  assert.match(card, /const \[attachmentDraft, setAttachmentDraft\]/);
  assert.match(
    card,
    /const \[pendingAttachmentFields, setPendingAttachmentFields\]/,
  );
  assert.match(card, /const attachmentRevisionRef = useRef\(\{\}\)/);
  assert.match(card, /const updateAttachment = async \(field, value\) =>/);
  assert.match(card, /await updatePacket\(\{ \[field\]: value \}\)/);
  assert.match(card, /disabled=\{pendingAttachmentFields\.has\("resumeId"\)\}/);
  assert.match(
    card,
    /disabled=\{pendingAttachmentFields\.has\("coverLetterId"\)\}/,
  );
  assert.match(card, /pendingAttachmentFields\.size > 0/);
  assert.match(card, /const \[verificationDraft, setVerificationDraft\]/);
  assert.match(
    card,
    /const \[pendingVerificationIds, setPendingVerificationIds\]/,
  );
  assert.match(card, /const verificationRevisionRef = useRef\(\{\}\)/);
  assert.match(card, /const verificationIntentIdsRef = useRef\(new Set\(\)\)/);
  assert.match(
    card,
    /const markVerificationIntent = \(id\) => \{[\s\S]*?window\.setTimeout\(\(\) => verificationIntentIdsRef\.current\.delete\(id\), 0\)/,
  );
  assert.match(card, /pendingVerification\?\.answerRevision/);
  assert.match(
    card,
    /const canonicalAnswer = canonicalApplicationAnswer\(answer\)[\s\S]*?applicationQuestion: \{ id, answer: canonicalAnswer, verified: false \}/,
  );
  assert.match(
    card,
    /const canonicalAnswer = canonicalApplicationAnswer\([\s\S]*?setDraftAnswers\(\(answers\) => \(\{ \.\.\.answers, \[id\]: canonicalAnswer \}\)\)[\s\S]*?answer: canonicalAnswer/,
  );
  assert.match(
    card,
    /setPendingVerificationIds\(\(current\) => new Set\(current\)\.add\(id\)\)/,
  );
  assert.match(
    card,
    /await new Promise\(\(resolve\) => setTimeout\(resolve, 0\)\);[\s\S]*?const saved = await updatePacket/,
  );
  assert.match(card, /pending=\{pendingVerificationIds\.has\(question\.id\)\}/);
  assert.match(card, /pendingVerificationIds\.size > 0/);
  assert.match(
    card,
    /!verificationIntentIdsRef\.current\.has\(question\.id\)[\s\S]*?updateQuestion\(question\.id, event\.target\.value\)/,
  );
  assert.match(
    source,
    /onPointerDown=\{\(event\) => \{[\s\S]*?if \(event\.button === 0\) onIntent\?\.\(question\.id\)/,
  );
  assert.match(source, /disabled=\{pending \|\| !valid\}/);
  assert.match(source, /aria-busy=\{pending\}/);
});

test("FAQ deletion persists before mutating the form and cannot bless newer edits", async () => {
  const source = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const settings = source.slice(
    source.indexOf("function SettingsPage"),
    source.indexOf("function Privacy"),
  );
  const deletion = settings.slice(
    settings.indexOf('title="Delete FAQ question?"'),
    settings.indexOf('<div className="v2-page-intro">'),
  );

  const request = deletion.indexOf('await api("/api/profile/faqs/delete"');
  const localMutation = deletion.indexOf("setForm((current)");
  assert.ok(request >= 0, "FAQ deletion must persist the profile");
  assert.ok(
    localMutation > request,
    "FAQ deletion must not disappear locally before persistence succeeds",
  );
  assert.doesNotMatch(
    deletion.slice(deletion.indexOf("onConfirm={async"), request),
    /setFaqDeleteTarget\(null\)/,
  );
  assert.match(deletion, /const deletionRevision = formRevision\.current/);
  assert.match(deletion, /const targetId = faqDeleteTarget\.id/);
  assert.doesNotMatch(deletion, /JSON\.stringify\(\{ \.\.\.p,/);
  assert.match(
    deletion,
    /if \(!formDirty && formRevision\.current === deletionRevision\)\s*setSaved\(true\)/,
  );
  const refreshStart = settings.indexOf("<RefreshCcw size={14} /> Refresh");
  assert.notEqual(refreshStart, -1);
  const refreshButton = settings.lastIndexOf("<button", refreshStart);
  assert.match(
    settings.slice(refreshButton, refreshStart),
    /disabled=\{savingProfile\}[\s\S]*?editForm\(/,
  );
});

test("mobile overview controls stack instead of crushing the v2 dashboard", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const mobileOverview = styles.slice(
    styles.lastIndexOf(
      "@media (max-width: 700px)",
      styles.indexOf("main > header.integrated-page-header"),
    ),
    styles.indexOf("main > header.integrated-page-header"),
  );

  assert.match(
    mobileOverview,
    /\.v2-hero-actions \{[\s\S]*?grid-template-columns: 1fr;[\s\S]*?width: 100%;/,
  );
  assert.match(
    mobileOverview,
    /\.v2-hero-actions button \{[\s\S]*?width: 100%;[\s\S]*?justify-content: center;/,
  );
  assert.match(
    mobileOverview,
    /\.v2-chart-card \.v2-card-head \{\s*flex-direction: column;/,
  );
  assert.match(
    mobileOverview,
    /\.v2-chart-toggles \{[\s\S]*?grid-template-columns: 1fr;[\s\S]*?width: 100%;/,
  );
  assert.match(
    mobileOverview,
    /\.v2-farewell-button \{[\s\S]*?position: static;[\s\S]*?margin: 24px 16px 92px;/,
  );
  assert.doesNotMatch(mobileOverview, /\.v2-chart-legend/);
});

test("Job Tracker cards stack vertically and mobile stages snap at full width", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(
    styles,
    /\.status-column-content \.jobs-list \{[\s\S]*?display: flex;\s*flex-direction: column;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 768px\) \{[\s\S]*?\.kanban \{[\s\S]*?scroll-snap-type: x mandatory;/,
  );
  assert.match(
    styles,
    /\.kanban-column \{\s*width: calc\(100vw - 32px\);\s*min-width: calc\(100vw - 32px\);\s*max-width: none;/,
  );
  assert.match(styles, /scroll-snap-align: start;\s*scroll-snap-stop: always;/);
});

test("mobile User Center tabs remain readable and keep the active tab visible", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const settings = source.slice(
    source.indexOf("function SettingsPage"),
    source.indexOf("function Privacy"),
  );

  assert.match(
    settings,
    /getElementById\(`user-tab-\$\{activeTab\}`\)[\s\S]*?scrollIntoView\(\{ block: "nearest", inline: "center" \}\)/,
  );
  assert.match(settings, /\}, \[activeTab\]\);/);
  assert.match(
    styles,
    /@media \(max-width: 560px\) \{[\s\S]*?\.v2-user-tabs \{[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x mandatory;/,
  );
  assert.match(
    styles,
    /\.v2-user-tabs button \{\s*flex: 0 0 auto;\s*min-width: max-content;\s*padding: 11px 14px;[\s\S]*?scroll-snap-align: center;/,
  );
});
