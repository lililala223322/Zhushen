import type { RuleDataSnapshot } from "../rules/rule-data";
import { statKeys, type StatKey, type StatVector } from "../types/stat";
import { cloneVector, zeroVector } from "../utils/vector";

export interface HeirloomCalculationInput {
  characterPotential: Partial<StatVector>;
  className: string;
  level: number;
}

export interface HeirloomStatAllocation {
  stat: StatKey;
  characterPotential: number;
  classGrowth: number;
  totalGrowth: number;
  selected: boolean;
  weight: number;
  value: number;
}

export interface HeirloomCalculationResult {
  className: string;
  level: number;
  selectedCount: number;
  totalWeight: number;
  totalGrowth: StatVector;
  statValues: StatVector;
  allocations: HeirloomStatAllocation[];
  selectedAllocations: HeirloomStatAllocation[];
  warnings: string[];
}

function clampLevel(value: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(120, number));
}

export function calculateHeirloomAttributes(
  data: RuleDataSnapshot,
  input: HeirloomCalculationInput,
): HeirloomCalculationResult {
  const level = clampLevel(input.level);
  const selectedCount = level < 20 ? 2 : 3;
  const classGrowth = data.classGrowth[input.className] || zeroVector();
  const characterPotential = cloneVector(input.characterPotential);
  const warnings: string[] = [];

  if (!data.classGrowth[input.className]) {
    warnings.push(`未找到职业成长：${input.className || "未选择"}`);
  }

  const totalGrowth = zeroVector();
  statKeys.forEach((stat) => {
    totalGrowth[stat] = (Number(characterPotential[stat]) || 0) + (Number(classGrowth[stat]) || 0);
  });

  const rankedStats = [...statKeys].sort((a, b) => {
    const delta = totalGrowth[b] - totalGrowth[a];
    return Math.abs(delta) > 1e-9 ? delta : statKeys.indexOf(a) - statKeys.indexOf(b);
  });
  const selectedStats = new Set(rankedStats.slice(0, selectedCount));
  const totalWeight = [...selectedStats].reduce((sum, stat) => {
    return sum + Math.max(0, Number(totalGrowth[stat]) || 0);
  }, 0);

  if (level > 0 && totalWeight <= 0) {
    warnings.push("被选中的成长值合计不大于 0，无法分配传家宝属性。");
  }

  const statValues = zeroVector();
  const allocations = statKeys.map((stat) => {
    const selected = selectedStats.has(stat);
    const positiveGrowth = Math.max(0, Number(totalGrowth[stat]) || 0);
    const weight = selected && totalWeight > 0 ? positiveGrowth / totalWeight : 0;
    const value = level * weight;
    statValues[stat] = value;
    return {
      stat,
      characterPotential: Number(characterPotential[stat]) || 0,
      classGrowth: Number(classGrowth[stat]) || 0,
      totalGrowth: Number(totalGrowth[stat]) || 0,
      selected,
      weight,
      value,
    };
  });

  return {
    className: input.className,
    level,
    selectedCount,
    totalWeight,
    totalGrowth,
    statValues,
    allocations,
    selectedAllocations: allocations
      .filter((item) => item.selected)
      .sort((a, b) => b.totalGrowth - a.totalGrowth || statKeys.indexOf(a.stat) - statKeys.indexOf(b.stat)),
    warnings,
  };
}
