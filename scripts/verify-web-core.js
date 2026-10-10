import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function makeContext() {
  const context = { console };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("web/data.js"), context, { filename: "web/data.js" });
  vm.runInContext(read("web/core.js"), context, { filename: "web/core.js" });
  vm.runInContext(read("web/calc.js"), context, { filename: "web/calc.js" });
  return context;
}

function zeroVector(data) {
  return Object.fromEntries(data.stats.map((stat) => [stat, 0]));
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const ctx = makeContext();
const data = ctx.RULE_DATA;
const calc = ctx.GrowthCalc;
const core = ctx.ZhushenCore;
const failures = [];

for (const api of [
  "calculateGrowth",
  "planSkillThreshold",
  "evaluateBuildLimits",
  "calculateBasePotential",
  "calculateHeirloomAttributes",
  "bloodlineSummary",
  "bloodlineTotal",
  "availableDivineRaces",
  "allowedMortalRaces",
  "getTraitAvailability",
  "getTraitSelectionAvailability",
  "getSaintTraitGroups",
  "overriddenMortalTraits",
  "effectiveTraitsForCalculation",
]) {
  assert(typeof core?.[api] === "function", `ZhushenCore.${api} is not available`, failures);
}

for (const api of [
  "calculateGrowth",
  "planSkillThreshold",
  "evaluateBuildLimits",
  "calculateBasePotential",
  "calculateHeirloomAttributes",
  "bloodlineSummary",
  "bloodlineTotal",
  "availableDivineRaces",
  "allowedMortalRaces",
]) {
  assert(typeof calc?.[api] === "function", `GrowthCalc.${api} wrapper is not available`, failures);
}

const className = data.classGrowth["丛林猎手"] ? "丛林猎手" : Object.keys(data.classGrowth)[0];
const finalClass = data.classValues["掠袭骑兵"] ? "掠袭骑兵" : Object.keys(data.classValues)[0];
const finalClassEquipment = data.classEquipment[finalClass];
const falaInput = {
  sex: "女",
  level: 150,
  bloodlines: [{ race: "法拉希尔血裔", percent: 80 }],
  growthSegments: [{ fromLevel: 1, toLevel: 150, className }],
  currentState: { enabled: false, currentLevel: 1, className, stats: zeroVector(data) },
  traitIds: ["divine-fala", "fala-bird", "fala-forest-heir", "m-fala-nature-spirit"],
  equipmentStats: zeroVector(data),
  finalClass,
};
falaInput.characterPotential = calc.calculateBasePotential(falaInput);
const falaResult = calc.calculateGrowth(falaInput);
assert(falaResult.warnings.length === 0, "Fala sample should have no warnings", failures);
assert(
  falaResult.combatStats.technique > falaResult.normalStats.technique,
  "Fala combat technique should exceed normal technique",
  failures,
);

const saintSkill = data.traits.find((trait) => trait.type === "divine_skill" && trait.race === "圣子");
const saintTraits = data.traits.filter((trait) => trait.type === "saint_trait" && trait.race === "圣子");
const saintInput = {
  sex: "女",
  level: 120,
  bloodlines: [{ race: "古特", percent: 100 }],
  growthSegments: [{ fromLevel: 1, toLevel: 120, className }],
  currentState: { enabled: false, currentLevel: 1, className, stats: zeroVector(data) },
  traitIds: [saintSkill?.id, saintTraits[0]?.id, saintTraits[4]?.id].filter(Boolean),
  equipmentStats: zeroVector(data),
  finalClass,
};
saintInput.characterPotential = calc.calculateBasePotential(saintInput);
const saintResult = calc.calculateGrowth(saintInput);
assert(saintResult.selectedTraits.length === 3, "Saint sample should resolve three selected traits", failures);

const elfOverrideInput = {
  sex: "女",
  level: 1,
  bloodlines: [{ race: "高等精灵", percent: 100 }],
  growthSegments: [],
  currentState: { enabled: false, currentLevel: 1, className: "主教", stats: zeroVector(data) },
  traitIds: ["divine-elf", "elf-soul-singer", "m-elf-spirit"],
  equipmentStats: zeroVector(data),
  finalClass: "主教",
  characterPotential: zeroVector(data),
};
const elfOverrideAvailability = core.getTraitSelectionAvailability(data, {
  ...elfOverrideInput,
  traitIds: ["divine-elf", "m-elf-spirit"],
}, "elf-soul-singer");
assert(elfOverrideAvailability.available, "Divine trait should be selectable when it overrides a mortal trait", failures);
assert(
  elfOverrideAvailability.warnings.some((warning) => warning.code === "MORTAL_TRAIT_WILL_BE_OVERRIDDEN"),
  "Divine trait override should be reported as a warning",
  failures,
);
const elfOverrideResult = calc.calculateGrowth(elfOverrideInput);
assert(
  elfOverrideResult.overriddenMortalTraits.some((trait) => trait.id === "m-elf-spirit"),
  "Overridden mortal trait should remain visible in result metadata",
  failures,
);
assert(
  Math.abs(elfOverrideResult.traitMultiplierBonus.perception - 0.15) < 1e-9,
  "Overridden mortal trait should not contribute to calculation",
  failures,
);

const heirloom = calc.calculateHeirloomAttributes({
  characterPotential: Object.assign(zeroVector(data), {
    strength: 0.3,
    technique: 0.6,
    agility: 0.7,
    constitution: 0.3,
    perception: 1.2,
    will: 0.8,
  }),
  className: "主教",
  level: 30,
});
assert(heirloom.selectedCount === 3, "Heirloom level 30 should select three stats", failures);
assert(heirloom.selectedAllocations.length === 3, "Heirloom should return three selected allocations", failures);
assert(
  Math.abs(heirloom.selectedAllocations.reduce((sum, item) => sum + item.value, 0) - 30) < 1e-6,
  "Heirloom selected values should sum to the requested level",
  failures,
);

const hybridMissing = core.getTraitAvailability(data, {
  sex: "女",
  level: 100,
  bloodlines: [{ race: "古特", percent: 100 }],
  characterPotential: zeroVector(data),
  growthSegments: [],
  traitIds: [],
  equipmentStats: zeroVector(data),
  finalClass: "狂战士",
}, "gut-flame");
assert(!hybridMissing.available, "Hybrid trait should be unavailable without prerequisite", failures);
assert(
  hybridMissing.reasons.some((reason) => reason.code === "MISSING_PREREQUISITE_TRAIT"),
  "Hybrid trait should report missing prerequisite trait",
  failures,
);

const partConflict = core.getTraitSelectionAvailability(data, {
  sex: "女",
  level: 100,
  bloodlines: [{ race: "切瓦利王族", percent: 100 }],
  characterPotential: zeroVector(data),
  growthSegments: [],
  traitIds: ["m-chewa-power"],
  equipmentStats: zeroVector(data),
  finalClass: "狂战士",
}, "m-chewa-lion-power");
assert(!partConflict.available, "Trait selection should reject occupied parts", failures);

const plannerConfig = {
  gearSets: [
    {
      id: "gear-regression",
      name: "回归套装",
      primaryStats: ["will", "perception"],
      weapon: {
        type: finalClassEquipment?.weapons?.[0] || "",
        stats: Object.assign(zeroVector(data), { will: 35, perception: 10 }),
      },
      armor: {
        type: finalClassEquipment?.armor || "",
        stats: Object.assign(zeroVector(data), { will: 20, perception: 5 }),
      },
    },
  ],
  targets: [
    { id: "target-will", name: "回归意志", stat: "will", value: 90, groupId: "" },
  ],
  coreStats: ["strength", "technique", "agility"],
};

const plan = calc.planSkillThreshold(falaInput, plannerConfig);
assert(plan.targets.length === 1, "Planner should normalize one target", failures);
assert(plan.gearSets.length === 1, "Planner should normalize one gear set", failures);

const limit = calc.evaluateBuildLimits({
  sex: "女",
  level: 120,
  bloodlines: falaInput.bloodlines,
  traitIds: falaInput.traitIds,
  finalClass,
  equipmentStats: zeroVector(data),
  sampleCount: 8,
  seed: 20260625,
  constraints: [{ id: "manual-will", stat: "will", value: 80, label: "手动意志" }],
  equipmentWeight: 0,
  targetWeights: Object.assign(zeroVector(data), { technique: 1, agility: 1 }),
}, plannerConfig);
assert(limit.evaluatedBuildCount === 1, "Limit evaluator should evaluate one build", failures);
assert(limit.constraints.length === 1, "Limit evaluator should expose manual constraints", failures);
assert(limit.results[0]?.requirementDetails?.[0]?.label === "手动意志", "Manual constraint should produce a requirement detail", failures);
assert(limit.results[0]?.samples?.length === 8, "Limit evaluator should keep deterministic sample count", failures);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("web core verification passed: growth, heirloom, traits, planner, limit evaluator");
}
