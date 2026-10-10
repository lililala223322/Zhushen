import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allowedMortalRaces,
  availableDivineRaces,
  calculateBasePotential,
  calculateHeirloomAttributes,
  calculateGrowth,
  effectiveLevels,
  evaluateBuildLimits,
  getClassCategory,
  getSaintTraitGroups,
  getTraitAvailability,
  getTraitSelectionAvailability,
  planSkillThreshold,
  ruleData,
  validateBuildMessages,
  zeroVector,
} from "../src/index";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "../../..");

function loadBrowserRuleData(): any {
  const context: any = { console };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(root, "web/data.js"), "utf8"),
    context,
    { filename: "web/data.js" },
  );
  return context.RULE_DATA;
}

function statZero(data: any) {
  return Object.fromEntries(data.stats.map((stat: string) => [stat, 0]));
}

function falaInput(data: any) {
  const input: any = {
    sex: "女",
    level: 150,
    bloodlines: [{ race: "法拉希尔血裔", percent: 80 }],
    growthSegments: [{ fromLevel: 1, toLevel: 150, className: "丛林猎手" }],
    currentState: { enabled: false, currentLevel: 1, className: "丛林猎手", stats: statZero(data) },
    traitIds: ["divine-fala", "fala-bird", "fala-forest-heir", "m-fala-nature-spirit"],
    equipmentStats: statZero(data),
    finalClass: "掠袭骑兵",
  };
  input.characterPotential = calculateBasePotential(data, input);
  return input;
}

describe("@zhushen/core", () => {
  const data = ruleData;

  it("keeps the TypeScript rule data aligned with the browser rule data", () => {
    expect(ruleData).toEqual(loadBrowserRuleData());
  });

  it("calculates effective levels before and after level 60", () => {
    expect(effectiveLevels(1, 60)).toEqual({ total: 60, before60: 60, after60: 0 });
    expect(effectiveLevels(61, 70)).toEqual({ total: 3.5, before60: 0, after60: 10 });
  });

  it("classifies classes through core rules", () => {
    expect(getClassCategory("皇家骑兵").label).toBe("骑兵");
    expect(getClassCategory("长弓手").label).toBe("射手");
    expect(getClassCategory("不存在的职业").label).toBe("特殊");
  });

  it("checks hybrid divine trait prerequisites", () => {
    const missing = getTraitAvailability(data, {
      sex: "女",
      level: 100,
      bloodlines: [{ race: "古特", percent: 100 }],
      characterPotential: zeroVector(),
      growthSegments: [],
      traitIds: [],
      equipmentStats: zeroVector(),
      finalClass: "狂战士",
    }, "gut-flame");
    expect(missing.available).toBe(false);
    expect(missing.reasons.map((reason) => reason.code)).toContain("MISSING_BLOODLINE_RACE");
    expect(missing.reasons.map((reason) => reason.code)).toContain("MISSING_PREREQUISITE_TRAIT");

    const available = getTraitAvailability(data, {
      sex: "女",
      level: 100,
      bloodlines: [{ race: "古特", percent: 80 }, { race: "切瓦", percent: 20 }],
      characterPotential: zeroVector(),
      growthSegments: [],
      traitIds: ["m-chewa-power"],
      equipmentStats: zeroVector(),
      finalClass: "狂战士",
    }, "gut-flame");
    expect(available.available).toBe(true);
  });

  it("returns selection availability with count and part-conflict reasons", () => {
    const mortalLimit = getTraitSelectionAvailability(data, {
      sex: "女",
      level: 100,
      bloodlines: [{ race: "法拉希尔血裔", percent: 100 }],
      characterPotential: zeroVector(),
      growthSegments: [],
      traitIds: ["m-fala-forest-child", "m-fala-nature-spirit", "m-fala-all-seeing"],
      equipmentStats: zeroVector(),
      finalClass: "丛林猎手",
    }, "m-fala-forest-child");
    expect(mortalLimit.available).toBe(true);

    const partConflict = getTraitSelectionAvailability(data, {
      sex: "女",
      level: 100,
      bloodlines: [{ race: "切瓦利王族", percent: 100 }],
      characterPotential: zeroVector(),
      growthSegments: [],
      traitIds: ["m-chewa-power"],
      equipmentStats: zeroVector(),
      finalClass: "狂战士",
    }, "m-chewa-lion-power");
    expect(partConflict.available).toBe(false);
    expect(partConflict.reasons.map((reason) => reason.code)).toContain("TRAIT_PART_CONFLICT");

    const divineOverridesMortal = getTraitSelectionAvailability(data, {
      sex: "女",
      level: 100,
      bloodlines: [{ race: "高等精灵", percent: 100 }],
      characterPotential: zeroVector(),
      growthSegments: [],
      traitIds: ["divine-elf", "m-elf-spirit"],
      equipmentStats: zeroVector(),
      finalClass: "主教",
    }, "elf-soul-singer");
    expect(divineOverridesMortal.available).toBe(true);
    expect(divineOverridesMortal.warnings?.map((warning) => warning.code)).toContain("MORTAL_TRAIT_WILL_BE_OVERRIDDEN");
  });

  it("models saint traits as two one-choice groups", () => {
    const groups = getSaintTraitGroups(data);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ id: "mark", label: "圣印", maxSelected: 1 });
    expect(groups[1]).toMatchObject({ id: "role", label: "身份", maxSelected: 1 });

    const selectedTraits = ["saint-justice", "saint-mark-justice", "saint-mark-free"]
      .map((id) => data.traits.find((trait: any) => trait.id === id))
      .filter(Boolean);
    const warnings = validateBuildMessages(data, {
      sex: "女",
      level: 120,
      bloodlines: [{ race: "古特", percent: 100 }],
      characterPotential: zeroVector(),
      growthSegments: [{ fromLevel: 1, toLevel: 120, className: "狂战士" }],
      traitIds: selectedTraits.map((trait: any) => trait.id),
      equipmentStats: zeroVector(),
      finalClass: "狂战士",
    }, selectedTraits);
    expect(warnings.some((warning) => warning.includes("圣印特性只能选择一个"))).toBe(true);
  });

  it("calculates the Fala growth sample without changing core outputs", () => {
    const result = calculateGrowth(data, falaInput(data));
    expect(result.warnings).toEqual([]);
    expect(result.finalCharacterPotential.technique).toBeGreaterThan(result.basePotential.technique);
    expect(result.combatStats.technique).toBeGreaterThan(result.normalStats.technique);
    expect(result.segmentBreakdowns[0]?.effectiveLevels).toBeGreaterThan(60);
  });

  it("keeps overridden mortal traits selected but ignores them in calculations", () => {
    const input = {
      sex: "女" as const,
      level: 1,
      bloodlines: [{ race: "高等精灵", percent: 100 }],
      growthSegments: [],
      currentState: { enabled: false, currentLevel: 1, className: "主教", stats: zeroVector() },
      traitIds: ["divine-elf", "elf-soul-singer", "m-elf-spirit"],
      equipmentStats: zeroVector(),
      finalClass: "主教",
      characterPotential: zeroVector(),
    };
    const result = calculateGrowth(data, input);

    expect(result.selectedTraits.map((trait) => trait.id)).toContain("m-elf-spirit");
    expect(result.effectiveTraits.map((trait) => trait.id)).not.toContain("m-elf-spirit");
    expect(result.overriddenMortalTraits.map((trait) => trait.id)).toEqual(["m-elf-spirit"]);
    expect(result.traitMultiplierBonus.perception).toBeCloseTo(0.15, 6);
  });

  it("exposes planner and limit evaluator as core APIs", () => {
    const input = falaInput(data);
    const finalEquipment = data.classEquipment[input.finalClass];
    const plannerConfig = {
      gearSets: [{
        id: "gear-regression",
        name: "回归套装",
        primaryStats: ["will", "perception"],
        weapon: { type: finalEquipment.weapons[0], stats: { ...statZero(data), will: 35, perception: 10 } },
        armor: { type: finalEquipment.armor, stats: { ...statZero(data), will: 20, perception: 5 } },
      }],
      targets: [{ id: "target-will", name: "回归意志", stat: "will", value: 90, groupId: "" }],
      coreStats: ["strength", "technique", "agility"],
    };

    const plan = planSkillThreshold(data, input, plannerConfig);
    expect(plan.targets).toHaveLength(1);
    expect(plan.gearSets).toHaveLength(1);
    expect(Array.isArray(plan.plans)).toBe(true);

    const limit = evaluateBuildLimits(data, {
      sex: "女",
      level: 120,
      bloodlines: input.bloodlines,
      traitIds: input.traitIds,
      finalClass: input.finalClass,
      equipmentStats: statZero(data),
      sampleCount: 4,
      seed: 20260625,
      constraints: [{ id: "manual-will", stat: "will", value: 80, label: "手动意志" }],
      targetWeights: { ...statZero(data), technique: 1, agility: 1 },
    }, plannerConfig);
    expect(limit.evaluatedBuildCount).toBe(1);
    expect(limit.constraints).toHaveLength(1);
    expect(limit.results[0].requirementDetails[0].label).toBe("手动意志");
    expect(limit.results[0].samples).toHaveLength(4);
  });

  it("derives available divine and mortal races from bloodlines", () => {
    const input = falaInput(data);
    expect(availableDivineRaces(data, input)).toContain("法拉");
    expect(allowedMortalRaces(data, input)).toContain("法拉");
  });

  it("allocates heirloom stats from the top total growth values", () => {
    const characterPotential = {
      ...zeroVector(),
      strength: 0.3,
      technique: 0.6,
      agility: 0.7,
      constitution: 0.3,
      perception: 1.2,
      will: 0.8,
    };
    const customData = {
      ...data,
      classGrowth: {
        ...data.classGrowth,
        测试职业: {
          ...zeroVector(),
          constitution: 0.8,
          perception: 0.6,
          will: 1.2,
        },
      },
    };
    const result = calculateHeirloomAttributes(customData, {
      characterPotential,
      className: "测试职业",
      level: 30,
    });

    expect(result.selectedCount).toBe(3);
    expect(result.selectedAllocations.map((item) => item.stat)).toEqual(["will", "perception", "constitution"]);
    expect(result.statValues.constitution).toBeCloseTo(30 * 1.1 / 4.9, 6);
    expect(result.statValues.perception).toBeCloseTo(30 * 1.8 / 4.9, 6);
    expect(result.statValues.will).toBeCloseTo(30 * 2 / 4.9, 6);
  });

  it("uses two heirloom stats below level 20 and clamps the simplified page level", () => {
    const result = calculateHeirloomAttributes(data, {
      characterPotential: { ...zeroVector(), strength: 1, technique: 2, agility: 3 },
      className: "刺客",
      level: 125,
    });
    const low = calculateHeirloomAttributes(data, {
      characterPotential: { ...zeroVector(), strength: 1, technique: 2, agility: 3 },
      className: "刺客",
      level: 19,
    });

    expect(result.level).toBe(120);
    expect(result.selectedCount).toBe(3);
    expect(low.selectedCount).toBe(2);
    expect(low.selectedAllocations).toHaveLength(2);
    expect(low.selectedAllocations.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(19, 6);
  });
});
