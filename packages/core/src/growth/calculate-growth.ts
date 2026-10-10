import type { GrowthBuildInput } from "../types/build";
import type { GrowthResult, StatBreakdown } from "../types/result";
import type { StatKey } from "../types/stat";
import type { Trait } from "../types/trait";
import type { RuleDataSnapshot } from "../rules/rule-data";
import { statKeys } from "../types/stat";
import { bloodlineSummary, calculateBasePotential } from "./potential";
import { cloneVector, vectorSum, zeroVector } from "../utils/vector";
import { effectiveLevels, formatNumber } from "../utils/number";
import { validateBuildMessages } from "../validation/validate-build";
import { effectiveTraitsForCalculation, overriddenMortalTraits } from "../traits/effective-traits";

export function currentStateEnabled(input: Pick<GrowthBuildInput, "currentState">): boolean {
  return Boolean(input.currentState?.enabled);
}

export function deriveCurrentGrowth(
  data: RuleDataSnapshot,
  input: GrowthBuildInput,
  traitFlat: Record<StatKey, number>,
  traitMultiplierBonus: Record<StatKey, number>,
): Record<StatKey, number> {
  const currentState = input.currentState || undefined;
  if (!currentStateEnabled(input) || !currentState) return zeroVector();
  const currentClassValue = data.classValues[currentState.className] || zeroVector();
  const result = zeroVector();
  statKeys.forEach((stat) => {
    const multiplier = Math.max(0.000001, 1 + (Number(traitMultiplierBonus[stat]) || 0));
    const statValue = Number(currentState.stats?.[stat]) || 0;
    result[stat] = statValue / multiplier - traitFlat[stat] - currentClassValue[stat];
  });
  return result;
}

export function calculateGrowth(data: RuleDataSnapshot, input: GrowthBuildInput): GrowthResult {
  const selectedTraits = input.traitIds
    .map((id) => data.traits.find((trait) => trait.id === id))
    .filter((trait): trait is Trait => Boolean(trait));
  const effectiveTraits = effectiveTraitsForCalculation(selectedTraits);
  const overriddenTraits = overriddenMortalTraits(selectedTraits);
  const warnings = validateBuildMessages(data, input, selectedTraits);
  const level = Number(input.level) || 0;

  const traitPotentialBonus = vectorSum(effectiveTraits, "potentialBonus");
  const traitFlat = vectorSum(effectiveTraits, "flatStats");
  const traitMultiplierBonus = vectorSum(effectiveTraits, "multiplierStats");
  const divineCombatValue = vectorSum(
    effectiveTraits.filter((item) => item.type === "divine_skill"),
    "divineCombatValue",
  );
  const finalClassValue = data.classValues[input.finalClass] || zeroVector();
  const potentialLimit = calculateBasePotential(data, input);
  const basePotential = cloneVector(input.characterPotential || potentialLimit);

  const finalCharacterPotential = zeroVector();
  statKeys.forEach((stat) => {
    finalCharacterPotential[stat] = basePotential[stat] + traitPotentialBonus[stat];
  });

  const currentGrowth = deriveCurrentGrowth(data, input, traitFlat, traitMultiplierBonus);
  const ordinaryGrowth = cloneVector(currentGrowth);
  let routeEffectiveGrowthLevels = 0;
  const routePotentialGrowth = zeroVector();
  const minGrowthLevel = currentStateEnabled(input) ? (Number(input.currentState?.currentLevel) || 0) + 1 : 1;
  const segmentBreakdowns = input.growthSegments.map((segment) => {
    const classPotential = data.classGrowth[segment.className] || zeroVector();
    const adjustedFromLevel = Math.max(Number(segment.fromLevel) || 1, minGrowthLevel);
    const adjustedToLevel = Math.min(Number(segment.toLevel) || 0, level);
    const levels = effectiveLevels(adjustedFromLevel, adjustedToLevel);
    routeEffectiveGrowthLevels += levels.total;
    const contribution = zeroVector();
    statKeys.forEach((stat) => {
      contribution[stat] = (finalCharacterPotential[stat] + classPotential[stat]) * levels.total;
      routePotentialGrowth[stat] += contribution[stat];
      ordinaryGrowth[stat] += contribution[stat];
    });
    return {
      ...segment,
      adjustedFromLevel,
      adjustedToLevel,
      effectiveLevels: levels.total,
      before60Levels: levels.before60,
      after60Levels: levels.after60,
      classPotential,
      contribution,
    };
  });

  const normalStats = zeroVector();
  const combatStats = zeroVector();
  const weightedFinalPotential = zeroVector();
  const breakdown = {} as Record<StatKey, StatBreakdown>;
  statKeys.forEach((stat) => {
    weightedFinalPotential[stat] = routeEffectiveGrowthLevels > 0
      ? routePotentialGrowth[stat] / routeEffectiveGrowthLevels
      : finalCharacterPotential[stat];
    const multiplier = 1 + traitMultiplierBonus[stat];
    const divineCombatAdd = level * divineCombatValue[stat];
    const equipment = Number(input.equipmentStats?.[stat]) || 0;
    const classValue = finalClassValue[stat];
    const normalInside = ordinaryGrowth[stat] + traitFlat[stat] + equipment + classValue;
    const combatInside = ordinaryGrowth[stat] + divineCombatAdd + traitFlat[stat] + equipment + classValue;
    normalStats[stat] = multiplier * normalInside;
    combatStats[stat] = multiplier * combatInside;
    breakdown[stat] = {
      basePotential: basePotential[stat],
      bloodlinePotential: basePotential[stat],
      traitPotentialBonus: traitPotentialBonus[stat],
      finalCharacterPotential: finalCharacterPotential[stat],
      weightedFinalPotential: weightedFinalPotential[stat],
      currentGrowth: currentGrowth[stat],
      ordinaryGrowth: ordinaryGrowth[stat],
      divineCombatValue: divineCombatValue[stat],
      divineCombatAdd,
      traitFlat: traitFlat[stat],
      equipment,
      classValue,
      multiplier,
      multiplierBonus: traitMultiplierBonus[stat],
      normalInside,
      combatInside,
      normal: normalStats[stat],
      combat: combatStats[stat],
      normalFormula: `${formatNumber(multiplier)} * (${formatNumber(ordinaryGrowth[stat])} + ${formatNumber(traitFlat[stat])} + ${formatNumber(equipment)} + ${formatNumber(classValue)})`,
      combatFormula: `${formatNumber(multiplier)} * (${formatNumber(ordinaryGrowth[stat])} + ${level} * ${formatNumber(divineCombatValue[stat])} + ${formatNumber(traitFlat[stat])} + ${formatNumber(equipment)} + ${formatNumber(classValue)})`,
    };
  });

  return {
    input,
    selectedTraits,
    effectiveTraits,
    overriddenMortalTraits: overriddenTraits,
    bloodlineSummary: bloodlineSummary(data, input),
    potentialLimit,
    basePotential,
    currentGrowth,
    finalCharacterPotential,
    traitPotentialBonus,
    weightedFinalPotential,
    traitFlat,
    traitMultiplierBonus,
    divineCombatValue,
    segmentBreakdowns,
    normalStats,
    combatStats,
    breakdown,
    warnings,
  };
}
