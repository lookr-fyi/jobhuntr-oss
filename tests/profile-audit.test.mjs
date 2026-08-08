import test from "node:test";
import assert from "node:assert/strict";
import { auditProfessionalProfile } from "../server/profile-audit.mjs";

const profile = {
  targetRoles: ["Product Engineer"],
  skills: ["TypeScript", "React", "Automation"],
};

test("professional profile audit is deterministic and rewards specific evidence", () => {
  const weakInput = {
    headline: "Engineer",
    about: "I build things.",
    experience: "Worked on software.",
    skills: ["JavaScript"],
  };
  const strongInput = {
    headline:
      "Product Engineer building reliable TypeScript automation for growing teams",
    about: `I am a product engineer who turns ambiguous customer problems into reliable software. ${"I connect product decisions to measurable outcomes and communicate tradeoffs clearly. ".repeat(6)}Connect with me to discuss practical automation. Improved adoption 24%.`,
    experience: `${"Built and led TypeScript and React product improvements with customer feedback. ".repeat(12)} Reduced incidents 35%, improved activation 24%, and delivered 3 launches.`,
    skills: [
      "TypeScript",
      "React",
      "Automation",
      "Product",
      "Research",
      "Analytics",
      "APIs",
      "Testing",
      "Leadership",
      "Communication",
    ],
  };
  const weak = auditProfessionalProfile(weakInput, profile);
  const strong = auditProfessionalProfile(strongInput, profile);
  assert.ok(strong.total > weak.total);
  assert.ok(strong.metrics >= 3);
  assert.ok(strong.matchedTerms.includes("typescript"));
  assert.deepEqual(strong, auditProfessionalProfile(strongInput, profile));
});
