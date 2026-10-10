import type { GrowthBuildInput } from "../types/build";
import type { SaintTraitGroup, Trait, TraitAvailability } from "../types/trait";
import type { RuleDataSnapshot } from "../rules/rule-data";
import type { ValidationMessage, ValidationResult } from "../types/validation";
import { traitRaceForBloodline } from "../rules/rule-data";
import { calculateBasePotential, bloodlineTotal, getBloodlineRows } from "../growth/potential";
import { statKeys } from "../types/stat";
import { hasAnyStat } from "../utils/vector";
import { round } from "../utils/number";
import { getTraitAvailability } from "./trait-availability";
import {
  divineTraitOverridesMortalTrait,
  normalizedTraitPart,
  overriddenMortalTraits,
} from "../traits/effective-traits";

export function availableDivineRaces(data: RuleDataSnapshot, input: Pick<GrowthBuildInput, "bloodlines">): string[] {
  const rows = getBloodlineRows(input);
  const hasDivineSkill = (race: string) => data.traits.some((trait) => trait.type === "divine_skill" && trait.race === race);
  const races = rows
    .filter((row) => row.percent > 70)
    .map((row) => traitRaceForBloodline(data, row.race))
    .filter((race) => race && race !== "平民" && hasDivineSkill(race));
  return [...new Set([...races, "圣子"])];
}

export function allowedMortalRaces(data: RuleDataSnapshot, input: Pick<GrowthBuildInput, "bloodlines">): string[] {
  return getBloodlineRows(input)
    .filter((row) => traitRaceForBloodline(data, row.race) !== "平民")
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 2)
    .map((row) => traitRaceForBloodline(data, row.race));
}

export function saintTraitGroup(data: RuleDataSnapshot, trait: Trait): "" | "圣印" | "身份" {
  if (trait.type !== "saint_trait") return "";
  return getSaintTraitGroups(data).find((group) => group.traitIds.includes(trait.id))?.label || "";
}

export function getSaintTraitGroups(data: RuleDataSnapshot): SaintTraitGroup[] {
  const saintTraits = data.traits.filter((item) => item.type === "saint_trait" && item.race === "圣子");
  return [
    { id: "mark", label: "圣印", maxSelected: 1, traitIds: saintTraits.slice(0, 4).map((trait) => trait.id) },
    { id: "role", label: "身份", maxSelected: 1, traitIds: saintTraits.slice(4, 8).map((trait) => trait.id) },
  ];
}

export function getTraitSelectionAvailability(data: RuleDataSnapshot, input: GrowthBuildInput, traitId: string): TraitAvailability {
  const trait = data.traits.find((item) => item.id === traitId) as Trait | undefined;
  const base = getTraitAvailability(data, input, traitId);
  if (!trait) return base;

  const selectedIds = new Set(input.traitIds || []);
  const selectedTraits = (input.traitIds || [])
    .map((id) => data.traits.find((item) => item.id === id) as Trait | undefined)
    .filter((item): item is Trait => Boolean(item));
  const selected = selectedIds.has(trait.id);
  const reasons = [...base.reasons];
  const warnings = [...(base.warnings || [])];

  if (!selected && trait.type === "divine_skill") {
    const selectedSkills = selectedTraits.filter((item) => item.type === "divine_skill");
    if (selectedSkills.length > 0) {
      reasons.push({ code: "DIVINE_SKILL_LIMIT", message: "只能选择一个神技" });
    }
    if (!availableDivineRaces(data, input).includes(trait.race)) {
      reasons.push({ code: "DIVINE_SKILL_RACE_UNAVAILABLE", message: `${trait.race}神技当前不可选` });
    }
  }

  if (!selected && trait.type === "divine_trait") {
    const sameRaceCount = selectedTraits.filter((item) => item.type === "divine_trait" && item.race === trait.race).length;
    if (sameRaceCount >= 2) {
      reasons.push({ code: "DIVINE_TRAIT_LIMIT", message: "神子特性最多选择两个" });
    }
    const selectedSkill = selectedTraits.find((item) => item.type === "divine_skill");
    if (selectedSkill && selectedSkill.race !== trait.race) {
      reasons.push({ code: "DIVINE_TRAIT_RACE_MISMATCH", message: `需要先选择${trait.race}神技` });
    }
  }

  if (!selected && trait.type === "saint_trait") {
    const group = getSaintTraitGroups(data).find((item) => item.traitIds.includes(trait.id));
    if (group) {
      const selectedInGroup = selectedTraits.filter((item) => group.traitIds.includes(item.id)).length;
      if (selectedInGroup >= group.maxSelected) {
        reasons.push({ code: "SAINT_TRAIT_GROUP_LIMIT", message: `${group.label}只能选择一个` });
      }
    }
    const selectedSkill = selectedTraits.find((item) => item.type === "divine_skill");
    if (selectedSkill && selectedSkill.race !== "圣子") {
      reasons.push({ code: "SAINT_TRAIT_SKILL_MISMATCH", message: "需要先选择圣子神技" });
    }
  }

  if (!selected && trait.type === "mortal_trait") {
    const mortalTraits = selectedTraits.filter((item) => item.type === "mortal_trait");
    if (mortalTraits.length >= 3) {
      reasons.push({ code: "MORTAL_TRAIT_LIMIT", message: "凡人特性最多选择三个" });
    }
    if (!allowedMortalRaces(data, input).includes(trait.race)) {
      reasons.push({ code: "MORTAL_TRAIT_RACE_UNAVAILABLE", message: `${trait.race}凡人特性当前不可选` });
    }
  }

  if (trait.part && trait.type !== "saint_trait") {
    const part = normalizedTraitPart(trait.part);
    const occupiedTraits = selectedTraits.filter((item) => (
      item.id !== trait.id
      && item.type !== "saint_trait"
      && normalizedTraitPart(item.part) === part
    ));
    for (const occupied of occupiedTraits) {
      if (divineTraitOverridesMortalTrait(trait, occupied)) {
        warnings.push({
          code: "MORTAL_TRAIT_WILL_BE_OVERRIDDEN",
          message: `选择后会覆盖凡人特性：${occupied.name}`,
        });
      } else if (divineTraitOverridesMortalTrait(occupied, trait)) {
        warnings.push({
          code: "MORTAL_TRAIT_OVERRIDDEN_BY_DIVINE",
          message: `会被神子特性${occupied.name}覆盖，计算时不生效`,
        });
      } else if (!selected) {
        reasons.push({ code: "TRAIT_PART_CONFLICT", message: `${trait.part}部位已被${occupied.name}占用` });
      }
    }
  }

  return {
    available: reasons.length === 0,
    reasons,
    warnings,
    displayName: base.displayName,
    prerequisites: base.prerequisites,
  };
}

export function validateBuild(data: RuleDataSnapshot, input: GrowthBuildInput, selectedTraits: Trait[]): ValidationResult {
  const messages: ValidationMessage[] = validateBuildMessages(data, input, selectedTraits)
    .map((message) => ({
      severity: "warning",
      code: "BUILD_RULE_WARNING",
      message,
    }));
  return {
    messages,
    valid: messages.every((message) => message.severity !== "error"),
  };
}

export function validateBuildMessages(data: RuleDataSnapshot, input: GrowthBuildInput, selectedTraits: Trait[]): string[] {
  const warnings: string[] = [];
  const bloodlines = getBloodlineRows(input);
  const totalBloodline = bloodlineTotal(input);
  if (!bloodlines.length) {
    warnings.push("尚未填写血脉，系统会按 100% 平民血脉计算。");
  }
  if (totalBloodline > 100) {
    warnings.push(`血脉合计为 ${totalBloodline}%，超过 100%。`);
  }
  const seenBloodlines = new Set<string>();
  bloodlines.forEach((row, index) => {
    if (!data.races[row.race]) warnings.push(`第 ${index + 1} 条血脉未找到：${row.race}。`);
    if (row.percent % 10 !== 0) warnings.push(`${row.race} 血脉为 ${row.percent}%，不是 10% 的倍数。`);
    if (seenBloodlines.has(row.race)) warnings.push(`${row.race} 血脉重复填写。`);
    seenBloodlines.add(row.race);
  });

  const potentialLimit = calculateBasePotential(data, input);
  const actualPotential = input.characterPotential || potentialLimit;
  statKeys.forEach((stat) => {
    const actual = Number(actualPotential[stat]) || 0;
    if (actual > potentialLimit[stat] + 1e-9) {
      warnings.push(`${data.statLabels[stat]}潜力 ${actual} 超过血脉加权上限 ${round(potentialLimit[stat], 4)}。`);
    }
  });

  const divineSkills = selectedTraits.filter((item) => item.type === "divine_skill");
  const availableSkills = availableDivineRaces(data, input);
  if (divineSkills.length === 0) warnings.push("尚未选择神技，战斗属性不会获得神技战斗值。");
  if (divineSkills.length > 1) warnings.push("选择了多个神技；规则要求有且仅有一个神技。当前会把神技战斗值相加，建议修正。");
  divineSkills.forEach((skill) => {
    if (!hasAnyStat(skill.divineCombatValue)) warnings.push(`${skill.name} 尚未录入神技战斗值，因此只会应用成长列。`);
    if (!availableSkills.includes(skill.race)) warnings.push(`${skill.name} 需要 ${skill.race} 血脉大于 70%；圣子神技不受血脉限制。`);
  });

  const divineRace = divineSkills[0]?.race || "";
  const divineTraits = selectedTraits.filter((item) => item.type === "divine_trait");
  if (divineTraits.length > 2) warnings.push("神子特性超过两个。");
  divineTraits.forEach((item) => {
    if (divineRace && item.race !== divineRace) warnings.push(`${item.name} 属于${item.race}神子特性，但当前神技属于${divineRace}。`);
    const availability = getTraitAvailability(data, input, item.id);
    availability.reasons.forEach((reason) => warnings.push(`${item.name} ${reason.message}。`));
  });

  const saintTraits = selectedTraits.filter((item) => item.type === "saint_trait");
  const saintMarkCount = saintTraits.filter((item) => saintTraitGroup(data, item) === "圣印").length;
  const saintRoleCount = saintTraits.filter((item) => saintTraitGroup(data, item) === "身份").length;
  if (saintMarkCount > 1) warnings.push("圣子前四个圣印特性只能选择一个。");
  if (saintRoleCount > 1) warnings.push("圣子后四个身份特性只能选择一个。");
  saintTraits.forEach((item) => {
    if (divineRace && divineRace !== "圣子") warnings.push(`${item.name} 属于圣子特性，但当前神技属于${divineRace}。`);
  });

  const mortalTraits = selectedTraits.filter((item) => item.type === "mortal_trait");
  if (mortalTraits.length > 3) warnings.push("凡人特性超过三个。");
  const allowedMortals = allowedMortalRaces(data, input);
  const mortalRaces = [...new Set(mortalTraits.map((item) => item.race).filter(Boolean))];
  if (mortalRaces.length > 2) warnings.push(`凡人特性涉及 ${mortalRaces.length} 个种族，超过两个：${mortalRaces.join("、")}。`);
  mortalTraits.forEach((item) => {
    if (!allowedMortals.includes(item.race)) warnings.push(`${item.name} 不属于当前血脉最高的前两个种族凡人特性。`);
  });

  overriddenMortalTraits(selectedTraits).forEach((trait) => {
    const divine = selectedTraits.find((item) => divineTraitOverridesMortalTrait(item, trait));
    if (divine) warnings.push(`${trait.name} 被神子特性 ${divine.name} 覆盖，计算属性时不生效。`);
  });

  const reportedPartConflicts = new Set<string>();
  for (let i = 0; i < selectedTraits.length; i += 1) {
    const first = selectedTraits[i]!;
    if (!first.part || first.type === "saint_trait") continue;
    for (let j = i + 1; j < selectedTraits.length; j += 1) {
      const second = selectedTraits[j]!;
      if (!second.part || second.type === "saint_trait") continue;
      const part = normalizedTraitPart(first.part);
      if (!part || part !== normalizedTraitPart(second.part)) continue;
      if (divineTraitOverridesMortalTrait(first, second) || divineTraitOverridesMortalTrait(second, first)) continue;
      const key = `${part}:${first.id}:${second.id}`;
      if (reportedPartConflicts.has(key)) continue;
      reportedPartConflicts.add(key);
      warnings.push(`${part} 部位冲突：${first.name} 与 ${second.name}。`);
    }
  }

  validateLevelsAndClasses(data, input, warnings);
  return warnings;
}

function validateLevelsAndClasses(data: RuleDataSnapshot, input: GrowthBuildInput, warnings: string[]): void {
  const level = Number(input.level) || 0;
  if (level < 1) warnings.push("目标等级必须大于等于 1。");
  const currentEnabled = Boolean(input.currentState?.enabled);
  const currentLevel = currentEnabled ? Number(input.currentState?.currentLevel) || 1 : 0;
  const minGrowthLevel = currentLevel > 0 ? currentLevel + 1 : 1;
  if (currentEnabled) {
    if (currentLevel < 1) warnings.push("当前等级必须大于等于 1。");
    if (currentLevel >= level) warnings.push(`当前等级 ${currentLevel} 必须低于目标等级 ${level}。`);
    if (input.currentState?.className && !data.classValues[input.currentState.className]) {
      warnings.push(`当前职业未在职业值表中找到：${input.currentState.className}。`);
    }
  }
  const covered = new Map<number, number>();
  input.growthSegments.forEach((segment, index) => {
    const from = Number(segment.fromLevel);
    const to = Number(segment.toLevel);
    if (!data.classGrowth[segment.className]) warnings.push(`第 ${index + 1} 段成长职业未在职业潜力表中找到：${segment.className}。`);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) warnings.push(`第 ${index + 1} 段成长等级范围无效。`);
    if (from < minGrowthLevel || to > level) warnings.push(`第 ${index + 1} 段成长范围 ${from}-${to} 超出 ${minGrowthLevel}-${level}。`);
    for (let current = Math.max(minGrowthLevel, from); current <= Math.min(level, to); current += 1) {
      if (covered.has(current)) warnings.push(`等级 ${current} 被多个成长区间覆盖。`);
      covered.set(current, index);
    }
  });
  const expectedCovered = Math.max(0, level - minGrowthLevel + 1);
  if (expectedCovered > 0 && covered.size < expectedCovered) {
    warnings.push(`成长路线只覆盖 ${covered.size}/${expectedCovered} 个可规划等级，未覆盖等级不会产生职业成长。`);
  }
  if (!data.classValues[input.finalClass]) warnings.push(`最终职业未在职业值表中找到：${input.finalClass}。`);
}
