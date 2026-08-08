const words = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
const unique = (values) => [...new Set(values)];

export function auditProfessionalProfile(input, profile) {
  const headline = String(input.headline || "").trim();
  const about = String(input.about || "").trim();
  const experience = String(input.experience || "").trim();
  const skills = Array.isArray(input.skills)
    ? input.skills
        .map(String)
        .map((value) => value.trim())
        .filter(Boolean)
    : String(input.skills || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const targetContext = String(input.targetContext || "").trim();
  const contextTerms = words(targetContext.toLowerCase())
    .map((term) => term.replace(/[^a-z0-9+#.-]/g, ""))
    .filter(
      (term) =>
        term.length > 3 &&
        ![
          "with",
          "that",
          "this",
          "from",
          "have",
          "will",
          "your",
          "about",
          "role",
          "team",
          "work",
        ].includes(term),
    );
  const targetTerms = unique(
    [...(profile.targetRoles || []), ...(profile.skills || []), ...contextTerms]
      .flatMap((value) => String(value).toLowerCase().split(/\s+/))
      .filter((term) => term.length > 2),
  ).slice(0, 80);
  const combined =
    `${headline} ${about} ${experience} ${skills.join(" ")}`.toLowerCase();
  const matchedTerms = targetTerms.filter((term) => combined.includes(term));
  const metrics = (
    experience.match(/\b\d+(?:[.,]\d+)?(?:%|x|k|m|\+)?\b/gi) || []
  ).length;
  const headlineWords = words(headline).length;
  const aboutWords = words(about).length;
  const experienceWords = words(experience).length;
  const headlineScore = Math.min(
    100,
    (headlineWords >= 6 ? 45 : headlineWords * 7) +
      (matchedTerms.some((term) => headline.toLowerCase().includes(term))
        ? 35
        : 0) +
      (headline.length <= 220 ? 20 : 5),
  );
  const aboutScore = Math.min(
    100,
    (aboutWords >= 80 ? 55 : Math.round((aboutWords / 80) * 55)) +
      (/\b(i|my|i'm|i’ve)\b/i.test(about) ? 15 : 0) +
      (/contact|connect|reach|message|help/i.test(about) ? 15 : 0) +
      (/\d/.test(about) ? 15 : 0),
  );
  const experienceScore = Math.min(
    100,
    (experienceWords >= 120 ? 50 : Math.round((experienceWords / 120) * 50)) +
      Math.min(30, metrics * 10) +
      (/\b(led|built|launched|grew|improved|reduced|owned|created|delivered)\b/i.test(
        experience,
      )
        ? 20
        : 0),
  );
  const skillsScore = Math.min(
    100,
    skills.length * 8 + Math.min(40, matchedTerms.length * 5),
  );
  const total = Math.round(
    headlineScore * 0.2 +
      aboutScore * 0.25 +
      experienceScore * 0.35 +
      skillsScore * 0.2,
  );
  const checks = [
    {
      section: "Headline",
      score: headlineScore,
      status: headlineScore >= 75 ? "strong" : "improve",
      detail:
        headlineWords < 6
          ? "Add role, specialty, and outcome—not only a job title."
          : "Headline length is useful for search and positioning.",
    },
    {
      section: "About",
      score: aboutScore,
      status: aboutScore >= 75 ? "strong" : "improve",
      detail:
        aboutWords < 80
          ? `Add ${80 - aboutWords} or more words of evidence, motivation, and a call to action.`
          : "About section has enough depth to communicate a narrative.",
    },
    {
      section: "Experience",
      score: experienceScore,
      status: experienceScore >= 75 ? "strong" : "improve",
      detail:
        metrics < 3
          ? "Add at least three truthful metrics across experience bullets."
          : `${metrics} quantified outcomes detected.`,
    },
    {
      section: "Skills",
      score: skillsScore,
      status: skillsScore >= 75 ? "strong" : "improve",
      detail:
        skills.length < 10
          ? "List at least ten focused skills that match target roles."
          : `${skills.length} skills supplied.`,
    },
  ];
  const suggestions = checks
    .filter((check) => check.status === "improve")
    .map((check) => `${check.section}: ${check.detail}`);
  if (matchedTerms.length < Math.min(5, targetTerms.length))
    suggestions.push(
      targetContext
        ? "Use more truthful language from the target role in your headline, About section, and recent experience."
        : "Use more of your saved target-role and skill language where it is truthful.",
    );
  return {
    total,
    checks,
    matchedTerms,
    metrics,
    suggestions,
    stats: {
      headlineWords,
      aboutWords,
      experienceWords,
      skillCount: skills.length,
      targetContextWords: words(targetContext).length,
    },
  };
}
