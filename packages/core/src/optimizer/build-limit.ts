import type { GrowthBuildInput } from "../types/build";
import type { RuleDataSnapshot } from "../rules/rule-data";
import type { StatKey, StatVector } from "../types/stat";
import type { Trait } from "../types/trait";
import type { PlannerConfig } from "../planner/skill-threshold";
import { statKeys } from "../types/stat";
import { allowedMortalRaces, availableDivineRaces } from "../validation/validate-build";
import { bloodlineSummary, calculateBasePotential } from "../growth/potential";
import { effectiveLevels } from "../utils/number";
import { addInto, vectorSum, zeroVector } from "../utils/vector";
import { effectiveTraitsForCalculation, hasBlockingTraitPartConflict } from "../traits/effective-traits";

export interface LimitEvaluatorConfig extends Record<string, any> {
  targetWeights?: Partial<StatVector>;
  bloodlines?: GrowthBuildInput["bloodlines"];
  traitIds?: string[];
  sex?: GrowthBuildInput["sex"];
  level?: number;
  finalClass?: string;
  equipmentStats?: StatVector;
  constraints?: unknown[];
  sampleCount?: number;
  seed?: number;
}

export interface LimitEvaluatorResult extends Record<string, any> {
  generatedBloodlineCount: number;
  evaluatedBuildCount: number;
  sampleCount: number;
  seed: number;
  constraints: Array<{ id: string; stat: StatKey; value: number; label: string }>;
  targetWeights: StatVector;
  priorities: StatVector;
  results: any[];
  warnings: string[];
}

function normalizedLimitWeights(config: LimitEvaluatorConfig): StatVector {
  const result = zeroVector();
  statKeys.forEach((stat) => {
    result[stat] = Math.max(0, Number(config?.targetWeights?.[stat]) || 0);
  });
  if (!statKeys.some((stat) => result[stat] > 0)) {
    result.technique = 1;
    result.agility = 1;
  }
  return result;
}

function normalizeLimitConstraints(input: unknown[]): Array<{ id: string; stat: StatKey; value: number; label: string }> {
  return (Array.isArray(input) ? input : [])
    .map((item, index) => {
      const row = item as Partial<{ id: string; stat: StatKey; value: number; label: string; name: string }>;
      const stat = statKeys.includes(row.stat as StatKey) ? row.stat as StatKey : "will";
      return {
        id: String(row.id || `constraint-${index}`),
        stat,
        value: Math.max(0, Number(row.value) || 0),
        label: String(row.label || row.name || "").trim(),
      };
    })
    .filter((item) => item.value > 0);
}

function limitWeightSum(weights: StatVector): number {
  return statKeys.reduce((sum, stat) => sum + (Number(weights[stat]) || 0), 0);
}

function scoreStatVector(vector: Partial<StatVector> | undefined, weights: Partial<StatVector> | undefined): number {
  return statKeys.reduce((sum, stat) => sum + (Number(vector?.[stat]) || 0) * (Number(weights?.[stat]) || 0), 0);
}

function createRng(seed: number): () => number {
  let state = Math.max(1, Math.floor(Number(seed) || 1)) % 2147483647;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function combinations<T>(items: T[], maxSize: number): T[][] {
  const result: T[][] = [[]];
  const limit = Math.min(maxSize, items.length);
  function walk(start: number, picked: T[]) {
    if (picked.length) result.push([...picked]);
    if (picked.length >= limit) return;
    for (let i = start; i < items.length; i += 1) {
      picked.push(items[i]!);
      walk(i + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  return result;
}

function traitsHavePartConflict(traits: Trait[]): boolean {
  return hasBlockingTraitPartConflict(traits);
}

function traitSearchScore(traits: Trait[], weights: StatVector, level: number): number {
  const effectiveTraits = effectiveTraitsForCalculation(traits);
  const flat = vectorSum(effectiveTraits, "flatStats");
  const multiplier = vectorSum(effectiveTraits, "multiplierStats");
  const potential = vectorSum(effectiveTraits, "potentialBonus");
  const divine = vectorSum(effectiveTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue");
  return statKeys.reduce((sum, stat) => {
    const weight = Number(weights[stat]) || 0;
    return sum + weight * (flat[stat] + potential[stat] * 40 + divine[stat] * (Number(level) || 0) + multiplier[stat] * 120);
  }, 0);
}

function traitIdsLabel(data: RuleDataSnapshot, ids: string[]): string {
  return ids
    .map((id) => data.traits.find((trait) => trait.id === id)?.name)
    .filter(Boolean)
    .join("，");
}

export function generateTraitCombosForBuild(
  data: RuleDataSnapshot,
  input: GrowthBuildInput,
  config: LimitEvaluatorConfig,
  weights: StatVector,
): Array<{ traitIds: string[]; label: string; score: number }> {
  const level = Number(config.level) || Number(input.level) || 1;
  const maxTraitCombos = Math.max(1, Math.min(80, Number(config.maxTraitCombos) || 8));
  const availableSkillRaces = availableDivineRaces(data, input);
  const skillTraits = data.traits.filter((trait) => (
    trait.type === "divine_skill" && availableSkillRaces.includes(trait.race)
  )) as Trait[];
  const skillChoices: Array<Trait | null> = skillTraits.length ? skillTraits : [null];
  const mortalPool = data.traits.filter((trait) => (
    trait.type === "mortal_trait" && allowedMortalRaces(data, input).includes(trait.race)
  )) as Trait[];
  const mortalCombos = combinations(mortalPool, 3).filter((items) => !traitsHavePartConflict(items));
  const candidates: Array<{ traitIds: string[]; label: string; score: number }> = [];

  skillChoices.forEach((skill) => {
    const dependentType = skill?.race === "圣子" ? "saint_trait" : "divine_trait";
    const dependentPool = skill
      ? data.traits.filter((trait) => trait.type === dependentType && trait.race === skill.race) as Trait[]
      : [];
    const dependentCombos = skill?.race === "圣子"
      ? dependentPool.slice(0, 4).flatMap((first) => dependentPool.slice(4, 8).map((second) => [first, second]))
      : combinations(dependentPool, 2).filter((items) => !traitsHavePartConflict(items));
    dependentCombos.forEach((dependent) => {
      mortalCombos.forEach((mortal) => {
        const traits = [skill, ...dependent, ...mortal].filter(Boolean) as Trait[];
        if (traitsHavePartConflict(traits)) return;
        const traitIds = traits.map((trait) => trait.id);
        candidates.push({
          traitIds,
          label: traitIdsLabel(data, traitIds) || "无神子特性",
          score: traitSearchScore(traits, weights, level),
        });
      });
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, maxTraitCombos);
}

function limitStatPriorities(config: LimitEvaluatorConfig, weights: StatVector): StatVector {
  const result = zeroVector();
  const maxWeight = Math.max(...statKeys.map((stat) => Number(weights[stat]) || 0), 0.000001);
  statKeys.forEach((stat) => {
    result[stat] = Math.max(result[stat], Math.min(1, (Number(weights[stat]) || 0) / maxWeight));
  });
  if (Number(config.equipmentWeight) > 0) {
    result.constitution = Math.max(result.constitution, 0.72);
  }
  normalizeLimitConstraints(config.constraints || []).forEach((constraint) => {
    result[constraint.stat] = Math.max(result[constraint.stat], 0.62);
  });
  return result;
}

function samplePotential(potentialLimit: StatVector, priorities: StatVector, rng: () => number, ideal: boolean): StatVector {
  const result = zeroVector();
  statKeys.forEach((stat) => {
    const upper = Math.max(0, (Number(potentialLimit[stat]) || 0) - 0.02);
    const priority = Math.max(0, Math.min(1, Number(priorities[stat]) || 0));
    const lower = Math.min(upper, upper * (0.16 + priority * 0.52));
    if (ideal) {
      result[stat] = upper;
    } else {
      const roll = rng();
      const biasedRoll = priority > 0.45 ? Math.max(roll, rng() * priority) : roll;
      result[stat] = lower + (upper - lower) * biasedRoll;
    }
  });
  return result;
}

function buildRouteRequirements(
  data: RuleDataSnapshot,
  config: LimitEvaluatorConfig,
  constants: Record<string, StatVector>,
  warnings: string[],
): { requirements: StatVector; details: any[] } {
  const requirements = zeroVector();
  const details: any[] = [];
  const level = Number(config.level) || 1;
  const equipmentWeight = Number(config.equipmentWeight) || 0;
  if (equipmentWeight > 0) {
    const requiredCombatConstitution = equipmentWeight / 3.5;
    const multiplier = Math.max(0.000001, 1 + constants.traitMultiplierBonus!.constitution);
    const requiredInside = requiredCombatConstitution / multiplier;
    const fixedInside = level * constants.divineCombatValue!.constitution
      + constants.traitFlat!.constitution
      + (Number(config.equipmentStats?.constitution) || 0)
      + constants.finalClassValue!.constitution;
    const neededGrowth = requiredInside - fixedInside;
    requirements.constitution = Math.max(requirements.constitution, neededGrowth);
    details.push({
      label: "最终负重",
      stat: "constitution",
      required: requiredCombatConstitution,
      growthRequired: Math.max(0, neededGrowth),
    });
  }

  const constraints = normalizeLimitConstraints(config.constraints || []);
  constraints.forEach((constraint) => {
    const multiplier = Math.max(0.000001, 1 + constants.traitMultiplierBonus![constraint.stat]);
    const requiredInside = constraint.value / multiplier;
    const fixedInside = level * constants.divineCombatValue![constraint.stat]
      + constants.traitFlat![constraint.stat]
      + (Number(config.equipmentStats?.[constraint.stat]) || 0)
      + constants.finalClassValue![constraint.stat];
    const neededGrowth = requiredInside - fixedInside;
    requirements[constraint.stat] = Math.max(requirements[constraint.stat], neededGrowth);
    details.push({
      label: constraint.label || data.statLabels[constraint.stat],
      stat: constraint.stat,
      required: constraint.value,
      growthRequired: Math.max(0, neededGrowth),
    });
  });
  return { requirements, details };
}

function routeAllocationsText(allocations: Record<string, number>): Array<{ className: string; effectiveLevels: number }> {
  return Object.entries(allocations)
    .filter(([, value]) => Number(value) > 1e-6)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([className, value]) => ({ className, effectiveLevels: value }));
}

function optimizeLimitRoute(data: RuleDataSnapshot, context: Record<string, any>): Record<string, any> {
  const totalEffectiveLevels = effectiveLevels(1, context.level).total;
  const classNames = Object.keys(data.classGrowth);
  const rates: Record<string, StatVector> = {};
  const scoreRates: Record<string, number> = {};
  classNames.forEach((className) => {
    rates[className] = zeroVector();
    statKeys.forEach((stat) => {
      rates[className]![stat] = context.finalCharacterPotential[stat] + (Number(data.classGrowth[className]?.[stat]) || 0);
    });
    scoreRates[className] = scoreStatVector(rates[className], context.combatScoreWeights);
  });

  function evaluate(allocations: Record<string, number>) {
    const growth = zeroVector();
    Object.entries(allocations).forEach(([className, amount]) => {
      statKeys.forEach((stat) => {
        growth[stat] += rates[className]![stat] * amount;
      });
    });
    const normalStats = zeroVector();
    const combatStats = zeroVector();
    statKeys.forEach((stat) => {
      const multiplier = 1 + context.traitMultiplierBonus[stat];
      const fixedNormal = context.traitFlat[stat]
        + (Number(context.equipmentStats?.[stat]) || 0)
        + context.finalClassValue[stat];
      const fixedCombat = fixedNormal + context.level * context.divineCombatValue[stat];
      normalStats[stat] = multiplier * (growth[stat] + fixedNormal);
      combatStats[stat] = multiplier * (growth[stat] + fixedCombat);
    });
    const deficits = zeroVector();
    statKeys.forEach((stat) => {
      deficits[stat] = Math.max(0, (Number(context.requirements[stat]) || 0) - growth[stat]);
    });
    const deficitSum = statKeys.reduce((sum, stat) => sum + deficits[stat], 0);
    return {
      allocations,
      allocationList: routeAllocationsText(allocations),
      growth,
      normalStats,
      combatStats,
      score: scoreStatVector(combatStats, context.targetWeights),
      met: deficitSum <= 1e-6,
      deficits,
      deficitSum,
    };
  }

  function repair(startClass: string) {
    const allocations = Object.fromEntries(classNames.map((className) => [className, 0]));
    allocations[startClass] = totalEffectiveLevels;
    let current = evaluate(allocations);
    for (let iteration = 0; iteration < 16 && !current.met; iteration += 1) {
      let bestMove: { fromClass: string; toClass: string; amount: number; ratio: number } | null = null;
      Object.entries(allocations).forEach(([fromClass, amount]) => {
        if (amount <= 1e-6) return;
        classNames.forEach((toClass) => {
          if (toClass === fromClass) return;
          const delta = zeroVector();
          let progress = 0;
          let maxUseful = amount;
          statKeys.forEach((stat) => {
            delta[stat] = rates[toClass]![stat] - rates[fromClass]![stat];
            if (current.deficits[stat] > 1e-6 && delta[stat] > 1e-9) {
              progress += Math.min(current.deficits[stat], delta[stat]);
              maxUseful = Math.min(maxUseful, current.deficits[stat] / delta[stat]);
            }
          });
          if (progress <= 1e-9 || maxUseful <= 1e-9) return;
          const amountToMove = Math.max(0.000001, Math.min(amount, maxUseful));
          const scoreLoss = Math.max(0, (scoreRates[fromClass]! - scoreRates[toClass]!) * amountToMove);
          const ratio = scoreLoss / (progress * amountToMove);
          if (!bestMove || ratio < bestMove.ratio) {
            bestMove = { fromClass, toClass, amount: amountToMove, ratio };
          }
        });
      });
      const move = bestMove as { fromClass: string; toClass: string; amount: number; ratio: number } | null;
      if (!move) break;
      allocations[move.fromClass] = (allocations[move.fromClass] || 0) - move.amount;
      allocations[move.toClass] = (allocations[move.toClass] || 0) + move.amount;
      current = evaluate(allocations);
    }
    return current;
  }

  const orderedStarts = [...classNames]
    .sort((a, b) => scoreRates[b]! - scoreRates[a]!)
    .slice(0, Math.min(18, classNames.length));
  statKeys.forEach((stat) => {
    const bestForStat = [...classNames].sort((a, b) => rates[b]![stat] - rates[a]![stat])[0];
    if (bestForStat && !orderedStarts.includes(bestForStat)) orderedStarts.push(bestForStat);
  });

  return orderedStarts
    .map((className) => repair(className))
    .sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score || a.deficitSum - b.deficitSum)[0] || {};
}

function percentile(sortedValues: number[], pct: number): number {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * pct) - 1));
  return sortedValues[index] || 0;
}

function aggregateLimitStats(results: Array<Record<string, any>>) {
  const sortedScores = results.map((item) => item.score).sort((a, b) => a - b);
  const passCount = results.filter((item) => item.met).length;
  const average = sortedScores.reduce((sum, value) => sum + value, 0) / Math.max(1, sortedScores.length);
  return {
    average,
    median: percentile(sortedScores, 0.5),
    p90: percentile(sortedScores, 0.9),
    p95: percentile(sortedScores, 0.95),
    passRate: passCount / Math.max(1, results.length),
  };
}

function evaluateOneLimitBuild(
  data: RuleDataSnapshot,
  baseInput: GrowthBuildInput,
  traitIds: string[],
  config: LimitEvaluatorConfig,
  rng: () => number,
  priorities: StatVector,
): Record<string, any> {
  const level = Number(config.level) || 1;
  const selectedTraits = traitIds.map((id) => data.traits.find((trait) => trait.id === id)).filter(Boolean) as Trait[];
  const effectiveTraits = effectiveTraitsForCalculation(selectedTraits);
  const traitPotentialBonus = vectorSum(effectiveTraits, "potentialBonus");
  const constants = {
    traitFlat: vectorSum(effectiveTraits, "flatStats"),
    traitMultiplierBonus: vectorSum(effectiveTraits, "multiplierStats"),
    divineCombatValue: vectorSum(effectiveTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue"),
    finalClassValue: data.classValues[config.finalClass || ""] || zeroVector(),
  };
  const warnings: string[] = [];
  const requirements = buildRouteRequirements(data, config, constants, warnings);
  const potentialLimit = calculateBasePotential(data, baseInput);
  const sampleCount = Math.max(1, Math.min(200, Number(config.sampleCount) || 16));
  const weights = normalizedLimitWeights(config);
  const combatScoreWeights = zeroVector();
  statKeys.forEach((stat) => {
    combatScoreWeights[stat] = weights[stat] * (1 + constants.traitMultiplierBonus[stat]);
  });

  function runSample(characterPotential: StatVector, ideal: boolean) {
    const finalCharacterPotential = zeroVector();
    statKeys.forEach((stat) => {
      finalCharacterPotential[stat] = characterPotential[stat] + traitPotentialBonus[stat];
    });
    const route = optimizeLimitRoute(data, {
      level,
      finalCharacterPotential,
      traitFlat: constants.traitFlat,
      traitMultiplierBonus: constants.traitMultiplierBonus,
      divineCombatValue: constants.divineCombatValue,
      finalClassValue: constants.finalClassValue,
      equipmentStats: config.equipmentStats || zeroVector(),
      requirements: requirements.requirements,
      targetWeights: weights,
      combatScoreWeights,
    });
    return Object.assign(route, { characterPotential, ideal });
  }

  const theory = runSample(samplePotential(potentialLimit, priorities, rng, true), true);
  const samples = [];
  for (let i = 0; i < sampleCount; i += 1) {
    samples.push(runSample(samplePotential(potentialLimit, priorities, rng, false), false));
  }
  const aggregate = aggregateLimitStats(samples);
  const bestSample = [...samples].sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score)[0];
  return {
    traitIds,
    traitLabel: traitIdsLabel(data, traitIds),
    theory,
    bestSample,
    samples,
    aggregate,
    requirementDetails: requirements.details,
    warnings,
  };
}

export function evaluateBuildLimits(
  data: RuleDataSnapshot,
  config: LimitEvaluatorConfig,
  plannerConfig?: PlannerConfig,
): LimitEvaluatorResult {
  const weights = normalizedLimitWeights(config);
  const warnings: string[] = [];
  if (limitWeightSum(weights) <= 0) warnings.push("未设置目标权重，已按技巧/敏捷各 1 计算。");
  const seed = config.seed || 20260623;
  const rng = createRng(seed);
  const priorities = limitStatPriorities(config, weights);
  const bloodlines = Array.isArray(config.bloodlines) && config.bloodlines.length ? config.bloodlines : [];
  const traitIds = Array.isArray(config.traitIds)
    ? config.traitIds.filter((id, index, array) => array.indexOf(id) === index)
    : [];
  const baseInput: GrowthBuildInput = {
    sex: config.sex || "女",
    level: Number(config.level) || 1,
    bloodlines,
    traitIds,
    characterPotential: zeroVector(),
    growthSegments: [],
    equipmentStats: config.equipmentStats || zeroVector(),
    finalClass: config.finalClass || "",
  };
  const evaluated: any[] = [];
  if (!bloodlines.length) {
    warnings.push("当前未指定血脉，系统会按 100% 平民血脉评估。");
  }
  if (!traitIds.length) {
    warnings.push("当前未选择特性，本轮会按无特性构筑评估。");
  }
  const result = evaluateOneLimitBuild(data, baseInput, traitIds, config, rng, priorities);
  result.bloodlines = bloodlines;
  result.bloodlineLabel = bloodlineSummary(data, { bloodlines })
    .map((row) => `${row.race}${row.percent}%${row.autoFilled ? "(自动)" : ""}`)
    .join(" + ");
  result.warnings.forEach((warning: string) => {
    if (!warnings.includes(warning)) warnings.push(warning);
  });
  evaluated.push(result);

  return {
    generatedBloodlineCount: 1,
    evaluatedBuildCount: evaluated.length,
    sampleCount: Math.max(1, Math.min(200, Number(config.sampleCount) || 16)),
    seed,
    constraints: normalizeLimitConstraints(config.constraints || []),
    targetWeights: weights,
    priorities,
    results: evaluated,
    warnings,
  };
}
