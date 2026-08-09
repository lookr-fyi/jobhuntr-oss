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
  assert.match(source, /templateDialog\.scoring \|\|/);
  assert.match(source, /"Scoring…"/);
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
    assert.match(agent, new RegExp(`if \\(${action}Ref\\.current\\) return`));
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
  assert.match(recurring, /runningRef\.current/);
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
  assert.match(tracker, /Escape" && !editBusyRef\.current/);
  assert.match(tracker, /Escape" && !addBusyRef\.current/);
  assert.match(tracker, /addBusy \? "Saving…" : "Save"/);
  assert.match(tracker, /disabled=\{addBusy\}/);
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
  assert.match(studio, /if \(savingTemplateRef\.current\) return/);
  assert.match(studio, /if \(generatingLetterRef\.current\) return/);
  assert.match(studio, /finishingLetterRef\.current\) return/);
  assert.match(studio, /savingLetterRef\.current\) return/);
  assert.match(studio, /"Generating…" : "Generate Cover Letter"/);
  assert.match(studio, /"Saving template…" : "Complete Template"/);
  assert.match(studio, /Escape" && !savingTemplateRef\.current/);
  assert.match(studio, /disabled=\{savingTemplate\}/);
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
  assert.match(gigs, /Escape" && !applyingGigRef\.current/);
  assert.match(gigs, /applyingGig \? "Submitting…" : "Submit Application"/);
  assert.match(gigs, /savingGig \? "Saving…" : "Save gig"/);
  assert.ok(
    (gigs.match(/disabled=\{savingGig\}/g) || []).length >= 3,
    "gig fields and close action must lock while creation is pending",
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
    /if \(profileRevision\.current === auditRevision\) setAudit\(result\)/,
  );
  assert.match(audit, /const editProfileUrl = \(value\) => \{/);
  assert.match(audit, /const editAuditForm = \(next\) => \{/);
  assert.ok(
    (audit.match(/profileRevision\.current \+= 1/g) || []).length >= 3,
    "URL edits, form edits, and history selection must invalidate pending audits",
  );
  assert.match(audit, /aria-busy=\{running\}/);
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
  assert.match(settings, /if \(savingProfile\) return/);
  assert.match(
    settings,
    /if \(formRevision\.current === savingRevision\) setSaved\(true\)/,
  );
  assert.match(settings, /finally \{\s*setSavingProfile\(false\)/);
  assert.match(settings, /aria-busy=\{savingProfile\}/);
});
