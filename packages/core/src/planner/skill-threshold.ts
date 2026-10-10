import type { GrowthBuildInput } from "../types/build";
import type { RuleDataSnapshot } from "../rules/rule-data";
import type { StatKey, StatVector } from "../types/stat";
import { statKeys } from "../types/stat";
import { calculateGrowth } from "../growth/calculate-growth";
import { currentStateEnabled } from "../growth/calculate-growth";
import { addInto, cloneVector, vectorHasStat, zeroVector } from "../utils/vector";
import { round } from "../utils/number";

export interface PlannerTarget {
  id: string;
  name: string;
  stat: StatKey;
  value: number;
  groupId: string;
}

export interface GearPiece {
  type: string;
  stats: StatVector;
}

export interface GearSet {
  id: string;
  name: string;
  primaryStats: StatKey[];
  weapon: GearPiece;
  armor: GearPiece;
}

export interface PlannerConfig {
  targets?: unknown[];
  gearSets?: unknown[];
  coreStats?: string[];
  coreWeights?: Partial<StatVector>;
}

export interface PlannerResult {
  targets: PlannerTarget[];
  gearSets: GearSet[];
  targetGroups: Array<{ key: string; label: string; targets: PlannerTarget[] }>;
  coreStats: StatKey[];
  checks: unknown[];
  meetsCurrent: boolean;
  plans: unknown[];
  warnings: string[];
}

function isStat(value: unknown): value is StatKey {
  return (statKeys as readonly string[]).includes(String(value));
}

export function normalizePlannerTargets(targets: unknown[]): PlannerTarget[] {
  return (Array.isArray(targets) ? targets : [])
    .map((target, index) => {
      const row = target as Partial<PlannerTarget>;
      return {
        id: row.id || `target-${index + 1}`,
        name: String(row.name || "").trim(),
        stat: isStat(row.stat) ? row.stat : "strength",
        value: Number(row.value) || 0,
        groupId: String(row.groupId || "").trim(),
      };
    })
    .filter((target) => target.value > 0);
}

export function normalizeGearSets(gearSets: unknown[]): GearSet[] {
  return (Array.isArray(gearSets) ? gearSets : [])
    .map((gear, index) => {
      const row = gear as Record<string, any>;
      return {
        id: row.id || `gear-${index + 1}`,
        name: String(row.name || `套装 ${index + 1}`).trim(),
        primaryStats: (Array.isArray(row.primaryStats) ? row.primaryStats : [])
          .filter((stat: unknown, itemIndex: number, array: unknown[]) => isStat(stat) && array.indexOf(stat) === itemIndex)
          .slice(0, 2) as StatKey[],
        weapon: {
          type: String(row.weapon?.type || "").trim(),
          stats: cloneVector(row.weapon?.stats),
        },
        armor: {
          type: String(row.armor?.type || "").trim(),
          stats: cloneVector(row.armor?.stats),
        },
      };
    })
    .filter((gear) => gear.name);
}

export function gearSetStats(gearSet: GearSet): StatVector {
  const result = zeroVector();
  addInto(result, gearSet?.weapon?.stats);
  addInto(result, gearSet?.armor?.stats);
  return result;
}

function gearSetSupportsStat(gearSet: GearSet, stat: StatKey): boolean {
  return vectorHasStat(gearSet?.weapon?.stats, stat) || vectorHasStat(gearSet?.armor?.stats, stat);
}

export function classCanUseGear(data: RuleDataSnapshot, className: string, gearSet: GearSet): boolean {
  const equipment = data.classEquipment?.[className];
  if (!equipment || !gearSet) return false;
  const weaponType = gearSet.weapon?.type;
  const armorType = gearSet.armor?.type;
  const weaponOk = weaponType ? (equipment.weapons || []).includes(weaponType) : false;
  const armorOk = armorType ? equipment.armor === armorType : false;
  return weaponOk && armorOk;
}

function targetGroupKey(target: PlannerTarget): string {
  return target.groupId || target.id;
}

function groupPlannerTargets(data: RuleDataSnapshot, targets: PlannerTarget[]): Array<{ key: string; label: string; targets: PlannerTarget[] }> {
  const byKey = new Map<string, PlannerTarget[]>();
  targets.forEach((target) => {
    const key = targetGroupKey(target);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(target);
  });
  return [...byKey.entries()].map(([key, items]) => {
    const first = items[0]!;
    return {
      key,
      label: items.length > 1 ? `检查组 ${key}` : (first.name || data.statLabels[first.stat] || first.stat),
      targets: items,
    };
  });
}

function classEffectiveCapacities(data: RuleDataSnapshot, input: GrowthBuildInput): Record<string, number> {
  const maxLevel = Number(input.level) || 0;
  const minLevel = currentStateEnabled(input) ? (Number(input.currentState?.currentLevel) || 0) + 1 : 1;
  const covered = new Set<number>();
  const capacities = new Map<string, number>();
  (input.growthSegments || []).forEach((segment) => {
    const from = Math.max(minLevel, Number(segment.fromLevel) || 1);
    const to = Math.min(maxLevel, Number(segment.toLevel) || 0);
    if (from > to || !data.classGrowth[segment.className]) return;
    for (let level = from; level <= to; level += 1) {
      if (covered.has(level)) continue;
      covered.add(level);
      const effective = level <= 60 ? 1 : 0.35;
      capacities.set(segment.className, (capacities.get(segment.className) || 0) + effective);
    }
  });
  return Object.fromEntries([...capacities.entries()]);
}

function targetCheckFromResult(data: RuleDataSnapshot, result: ReturnType<typeof calculateGrowth>, target: PlannerTarget): Record<string, any> {
  const breakdown = result.breakdown[target.stat];
  const multiplier = Math.max(0.000001, Number(breakdown.multiplier) || 1);
  const insideRequired = target.value / multiplier;
  const insideDeficit = Math.max(0, insideRequired - breakdown.normalInside);
  const value = result.normalStats[target.stat];
  return {
    id: target.id,
    name: target.name,
    groupId: target.groupId,
    stat: target.stat,
    label: data.statLabels[target.stat],
    required: target.value,
    value,
    deficit: Math.max(0, target.value - value),
    insideDeficit,
    insideRequired,
    normalInside: breakdown.normalInside,
    multiplier,
  };
}

function fallbackThresholdCheck(data: RuleDataSnapshot, input: GrowthBuildInput, group: { key: string; label: string; targets: PlannerTarget[] }): Record<string, any> {
  const build = Object.assign({}, input, {
    equipmentStats: zeroVector(),
    finalClass: input.finalClass,
  });
  const result = calculateGrowth(data, build);
  const targetChecks = group.targets.map((target) => targetCheckFromResult(data, result, target));
  return {
    key: group.key,
    label: group.label,
    className: input.finalClass,
    gearSetId: "",
    gearSetName: "无匹配套装",
    gearStats: zeroVector(),
    compatible: false,
    result,
    targetChecks,
    met: false,
    deficitSum: targetChecks.reduce((sum, target) => sum + target.insideDeficit, 0),
  };
}

function thresholdCheckForState(
  data: RuleDataSnapshot,
  input: GrowthBuildInput,
  group: { key: string; label: string; targets: PlannerTarget[] },
  gearSet: GearSet,
  className: string,
): Record<string, any> {
  const gearStats = gearSetStats(gearSet);
  const build = Object.assign({}, input, {
    equipmentStats: gearStats,
    finalClass: className,
  });
  const result = calculateGrowth(data, build);
  const targetChecks = group.targets.map((target) => targetCheckFromResult(data, result, target));
  return {
    key: group.key,
    label: group.label,
    className,
    gearSetId: gearSet.id,
    gearSetName: gearSet.name,
    gearStats,
    compatible: true,
    result,
    targetChecks,
    met: targetChecks.every((target) => target.deficit <= 1e-7),
    deficitSum: targetChecks.reduce((sum, target) => sum + target.insideDeficit, 0),
  };
}

function bestThresholdCheck(
  data: RuleDataSnapshot,
  input: GrowthBuildInput,
  group: { key: string; label: string; targets: PlannerTarget[] },
  gearSets: GearSet[],
): Record<string, any> {
  const candidates: Array<Record<string, any>> = [];
  Object.keys(data.classValues).forEach((className) => {
    gearSets.forEach((gearSet) => {
      if (!classCanUseGear(data, className, gearSet)) return;
      candidates.push(thresholdCheckForState(data, input, group, gearSet, className));
    });
  });
  if (!candidates.length) {
    return Object.assign(fallbackThresholdCheck(data, input, group), {
      alternatives: [],
    });
  }
  candidates.sort((a, b) => (
    a.deficitSum - b.deficitSum
    || Number(!a.met) - Number(!b.met)
    || b.targetChecks.reduce((sum: number, target: Record<string, any>) => sum + target.value, 0)
      - a.targetChecks.reduce((sum: number, target: Record<string, any>) => sum + target.value, 0)
  ));
  return Object.assign(candidates[0]!, {
    alternatives: candidates.slice(1, 4),
  });
}

function aggregatePlannerAllocations(allocations: Record<string, any>): any[] {
  return Object.values(allocations || {})
    .filter((item: any) => item.effectiveLevels > 1e-7)
    .sort((a: any, b: any) => (
      b.effectiveLevels - a.effectiveLevels
      || a.newClass.localeCompare(b.newClass, "zh-CN")
    ));
}

function allocationCount(state: Record<string, any>): number {
  return aggregatePlannerAllocations(state.allocations).length;
}

function selectPlannerStates(states: Array<Record<string, any>>, objectiveSort: (a: any, b: any) => number): Array<Record<string, any>> {
  if (!states.length) return [];
  const sorted = [...states].sort(objectiveSort);
  const selected: Array<Record<string, any>> = [];
  const pushUnique = (state: Record<string, any>, displayGroup: string) => {
    if (!state || selected.includes(state)) return;
    state.displayGroup = displayGroup;
    selected.push(state);
  };
  pushUnique(sorted[0]!, "best");
  sorted.filter((state) => allocationCount(state) > 1).slice(0, 3).forEach((state) => pushUnique(state, "combo"));
  sorted.filter((state) => allocationCount(state) <= 1).slice(0, 2).forEach((state) => pushUnique(state, "single"));
  sorted.forEach((state) => {
    if (selected.length < 6) pushUnique(state, "other");
  });
  return selected.slice(0, 6);
}

function flattenTargetChecks(checks: Array<Record<string, any>>): Array<Record<string, any>> {
  return checks.flatMap((check) => check.targetChecks.map((target: Record<string, any>) => Object.assign({}, target, {
    checkKey: check.key,
    checkLabel: check.label,
    className: check.className,
    gearSetId: check.gearSetId,
    gearSetName: check.gearSetName,
  })));
}

function coreStatVector(config: PlannerConfig): StatVector {
  const result = zeroVector();
  if (Array.isArray(config.coreStats)) {
    config.coreStats.forEach((stat) => {
      if (isStat(stat)) result[stat] = 1;
    });
    return result;
  }
  statKeys.forEach((stat) => {
    result[stat] = Number(config.coreWeights?.[stat]) > 0 ? 1 : 0;
  });
  return result;
}

function optimizeThresholdPlan(
  data: RuleDataSnapshot,
  input: GrowthBuildInput,
  config: PlannerConfig,
  checks: Array<Record<string, any>>,
  growthClasses: string[],
): Array<Record<string, any>> {
  const coreStats = coreStatVector(config);
  const targetChecks = flattenTargetChecks(checks);
  const initialRemaining: Record<string, number> = {};
  targetChecks.forEach((target) => {
    initialRemaining[target.id] = Math.max(0, target.insideDeficit || 0);
  });
  if (Object.values(initialRemaining).every((value) => value <= 1e-7)) {
    return [{
      title: "当前路线",
      reachable: true,
      alreadyMet: true,
      weightedLoss: 0,
      coreLossSum: 0,
      replacementCount: 0,
      effectiveChanged: 0,
      coreLoss: zeroVector(),
      delta: zeroVector(),
      targetResults: targetChecks,
      allocations: {},
      requirements: [],
    }];
  }

  const initialCapacities = classEffectiveCapacities(data, input);
  const baseClasses = Object.keys(initialCapacities).filter((className) => initialCapacities[className]! > 1e-7);
  if (!baseClasses.length || !growthClasses.length) return [];

  const transitions = baseClasses.flatMap((baseClass) => {
    const baseGrowth = data.classGrowth[baseClass] || zeroVector();
    return growthClasses
      .filter((newClass) => newClass !== baseClass)
      .map((newClass) => {
        const newGrowth = data.classGrowth[newClass] || zeroVector();
        const perEffectiveDelta = zeroVector();
        statKeys.forEach((stat) => {
          perEffectiveDelta[stat] = newGrowth[stat] - baseGrowth[stat];
        });
        const targetProgress = targetChecks.reduce((sum, target) => sum + Math.max(0, perEffectiveDelta[target.stat as StatKey]), 0);
        const coreLossPerEffective = zeroVector();
        let weightedLossPerEffective = 0;
        statKeys.forEach((stat) => {
          const selected = Number(coreStats[stat]) > 0;
          coreLossPerEffective[stat] = selected ? Math.max(0, -perEffectiveDelta[stat]) : 0;
          weightedLossPerEffective += coreLossPerEffective[stat];
        });
        return {
          key: `${baseClass}->${newClass}`,
          baseClass,
          newClass,
          perEffectiveDelta,
          targetProgress,
          coreLossPerEffective,
          weightedLossPerEffective,
        };
      })
      .filter((transition) => transition.targetProgress > 1e-9);
  });
  if (!transitions.length) return [];

  const targetKeys = targetChecks.map((target) => target.id);
  const beamWidth = 520;
  const maxIterations = Math.min(18, Math.max(8, targetKeys.length * 5 + baseClasses.length * 2));
  const stateKey = (state: Record<string, any>) => [
    targetKeys.map((key) => round(state.remaining[key] || 0, 3)).join("|"),
    baseClasses.map((className) => `${className}:${round(state.capacities[className] || 0, 3)}`).join("|"),
  ].join("::");
  const unmetSum = (remaining: Record<string, number>) => targetKeys.reduce((sum, key) => sum + Math.max(0, remaining[key] || 0), 0);
  const objectiveSort = (a: any, b: any) => (
    a.weightedLoss - b.weightedLoss
    || unmetSum(a.remaining) - unmetSum(b.remaining)
    || a.effectiveChanged - b.effectiveChanged
  );
  const initialState = {
    remaining: Object.assign({}, initialRemaining),
    capacities: Object.assign({}, initialCapacities),
    weightedLoss: 0,
    effectiveChanged: 0,
    coreLoss: zeroVector(),
    delta: zeroVector(),
    allocations: {},
  };
  let beam: Array<Record<string, any>> = [initialState];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const next = [...beam];
    let added = false;
    beam.forEach((state) => {
      transitions.forEach((transition) => {
        const capacity = Number(state.capacities[transition.baseClass]) || 0;
        if (capacity <= 1e-7) return;
        const helpedTargets = targetChecks
          .map((target) => ({
            target,
            delta: transition.perEffectiveDelta[target.stat as StatKey],
            remaining: Number(state.remaining[target.id]) || 0,
          }))
          .filter((item) => item.remaining > 1e-7 && item.delta > 1e-9);
        if (!helpedTargets.length) return;

        const maxUseful = Math.max(...helpedTargets.map((item) => item.remaining / item.delta));
        const amountChoices = [
          ...helpedTargets.map((item) => item.remaining / item.delta),
          maxUseful,
          capacity,
        ]
          .map((value) => Math.min(capacity, value))
          .filter((value, index, array) => value > 1e-7 && array.findIndex((item) => Math.abs(item - value) <= 1e-7) === index)
          .sort((a, b) => a - b);

        amountChoices.forEach((amount) => {
          const delta = zeroVector();
          const coreLoss = zeroVector();
          statKeys.forEach((stat) => {
            delta[stat] = transition.perEffectiveDelta[stat] * amount;
            coreLoss[stat] = transition.coreLossPerEffective[stat] * amount;
          });
          const remaining = Object.assign({}, state.remaining);
          targetChecks.forEach((target) => {
            remaining[target.id] = Math.max(0, (remaining[target.id] || 0) - delta[target.stat as StatKey]);
          });
          const totalCoreLoss = cloneVector(state.coreLoss);
          const totalDelta = cloneVector(state.delta);
          statKeys.forEach((stat) => {
            totalCoreLoss[stat] += coreLoss[stat];
            totalDelta[stat] += delta[stat];
          });
          const capacities = Object.assign({}, state.capacities);
          capacities[transition.baseClass] = Math.max(0, capacity - amount);
          const allocations = Object.assign({}, state.allocations);
          const previous = allocations[transition.key] || {
            baseClass: transition.baseClass,
            newClass: transition.newClass,
            effectiveLevels: 0,
            delta: zeroVector(),
          };
          const allocationDelta = cloneVector(previous.delta);
          addInto(allocationDelta, delta);
          allocations[transition.key] = {
            baseClass: transition.baseClass,
            newClass: transition.newClass,
            effectiveLevels: previous.effectiveLevels + amount,
            delta: allocationDelta,
          };
          next.push({
            remaining,
            capacities,
            weightedLoss: state.weightedLoss + transition.weightedLossPerEffective * amount,
            effectiveChanged: state.effectiveChanged + amount,
            coreLoss: totalCoreLoss,
            delta: totalDelta,
            allocations,
          });
          added = true;
        });
      });
    });
    if (!added) break;

    const bestByKey = new Map<string, Record<string, any>>();
    next.sort(objectiveSort);
    next.forEach((state) => {
      const key = stateKey(state);
      if (!bestByKey.has(key)) bestByKey.set(key, state);
    });
    const candidates = [...bestByKey.values()];
    const lowLoss = [...candidates].sort(objectiveSort).slice(0, Math.ceil(beamWidth / 2));
    const nearTarget = [...candidates]
      .sort((a, b) => unmetSum(a.remaining) - unmetSum(b.remaining) || objectiveSort(a, b))
      .slice(0, Math.floor(beamWidth / 2));
    const merged = new Map<string, Record<string, any>>();
    [...lowLoss, ...nearTarget].forEach((state) => {
      const key = `${stateKey(state)}:${round(state.weightedLoss, 4)}:${round(state.effectiveChanged, 3)}`;
      if (!merged.has(key)) merged.set(key, state);
    });
    beam = [...merged.values()].slice(0, beamWidth);
  }

  const metStates = beam
    .filter((state) => unmetSum(state.remaining) <= 1e-7)
    .sort(objectiveSort);
  const fallbackStates = metStates.length
    ? selectPlannerStates(metStates, objectiveSort)
    : beam.sort((a, b) => unmetSum(a.remaining) - unmetSum(b.remaining) || objectiveSort(a, b)).slice(0, 3);

  return fallbackStates.map((state) => {
    const targetResults = targetChecks.map((target) => {
      const projectedInside = target.normalInside + state.delta[target.stat as StatKey];
      const projectedValue = projectedInside * target.multiplier;
      return Object.assign({}, target, {
        value: projectedValue,
        deficit: Math.max(0, target.required - projectedValue),
        insideDeficit: Math.max(0, target.required / target.multiplier - projectedInside),
      });
    });
    return {
      title: "自动匹配",
      displayGroup: state.displayGroup || "other",
      reachable: targetResults.every((target) => target.deficit <= 1e-7),
      alreadyMet: false,
      weightedLoss: state.weightedLoss,
      coreLossSum: state.weightedLoss,
      replacementCount: aggregatePlannerAllocations(state.allocations).length,
      effectiveChanged: state.effectiveChanged,
      coreLoss: state.coreLoss,
      delta: state.delta,
      targetResults,
      allocations: state.allocations,
      requirements: aggregatePlannerAllocations(state.allocations),
    };
  });
}

export function planSkillThreshold(data: RuleDataSnapshot, input: GrowthBuildInput, plannerConfig?: PlannerConfig): PlannerResult {
  const config = plannerConfig || {};
  const targets = normalizePlannerTargets(config.targets || []);
  const gearSets = normalizeGearSets(config.gearSets || []);
  const growthClasses = Object.keys(data.classGrowth);
  const warnings: string[] = [];

  if (!targets.length) warnings.push("尚未设置有效技能门槛。");
  if (!gearSets.length) warnings.push("尚未填写属性套装，无法自动匹配学习状态。");

  targets.forEach((target) => {
    if (gearSets.length && !gearSets.some((gearSet) => gearSetSupportsStat(gearSet, target.stat))) {
      warnings.push(`${target.name || data.statLabels[target.stat]} 需要${data.statLabels[target.stat]}，但当前没有套装提供该属性。`);
    }
  });
  gearSets.forEach((gearSet) => {
    const compatibleClasses = Object.keys(data.classValues).filter((className) => classCanUseGear(data, className, gearSet));
    if (!compatibleClasses.length) {
      warnings.push(`${gearSet.name} 没有匹配的可用职业，请检查武器与护甲类型。`);
    }
  });

  const targetGroups = groupPlannerTargets(data, targets);
  const checks = targetGroups.map((group) => bestThresholdCheck(data, input, group, gearSets));
  checks.forEach((check) => {
    if (!check.compatible) warnings.push(`${check.label} 没有可用的套装 + 职业组合。`);
  });
  const meetsCurrent = checks.length > 0 && checks.every((check) => check.met);
  const displayGroupRank: Record<string, number> = { best: 0, combo: 1, single: 2, other: 3 };
  const plans = targets.length && checks.every((check) => check.compatible)
    ? optimizeThresholdPlan(data, input, config, checks, growthClasses)
      .sort((a, b) => (
        (displayGroupRank[a.displayGroup] ?? 3) - (displayGroupRank[b.displayGroup] ?? 3)
        || Number(!a.reachable) - Number(!b.reachable)
        || a.weightedLoss - b.weightedLoss
        || a.replacementCount - b.replacementCount
      ))
      .slice(0, 6)
    : [];

  return {
    targets,
    gearSets,
    targetGroups,
    coreStats: statKeys.filter((stat) => Number(coreStatVector(config)[stat]) > 0),
    checks,
    meetsCurrent,
    plans,
    warnings,
  };
}
