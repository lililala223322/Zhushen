import type { GrowthBuildInput, BloodlineInput } from "../types/build";
import type { RuleDataSnapshot } from "../rules/rule-data";
import type { StatVector } from "../types/stat";
import { addInto, zeroVector } from "../utils/vector";

export interface BloodlineSummary extends BloodlineInput {
  autoFilled?: boolean;
}

export function getBloodlineRows(input: Pick<GrowthBuildInput, "bloodlines"> & { race?: string }): BloodlineInput[] {
  if (Array.isArray(input.bloodlines) && input.bloodlines.length) {
    return input.bloodlines
      .map((row) => ({
        race: row.race,
        percent: Number(row.percent) || 0,
      }))
      .filter((row) => row.race && row.percent > 0);
  }
  if (input.race) {
    return [{ race: input.race, percent: 100 }];
  }
  return [];
}

export function bloodlineTotal(input: Pick<GrowthBuildInput, "bloodlines">): number {
  return getBloodlineRows(input).reduce((sum, row) => sum + row.percent, 0);
}

export function bloodlineSummary(data: RuleDataSnapshot, input: Pick<GrowthBuildInput, "bloodlines">): BloodlineSummary[] {
  const rows = getBloodlineRows(input);
  const total = rows.reduce((sum, row) => sum + row.percent, 0);
  if (total < 100) {
    return [...rows, { race: data.commonerRace, percent: 100 - total, autoFilled: true }];
  }
  return rows;
}

export function calculateBasePotential(data: RuleDataSnapshot, input: Pick<GrowthBuildInput, "sex" | "bloodlines">): StatVector {
  const result = zeroVector();
  const sex = input.sex || "女";
  bloodlineSummary(data, input).forEach((row) => {
    const racePotential = data.races[row.race]?.[sex];
    if (!racePotential) return;
    addInto(result, racePotential, row.percent / 100);
  });
  return result;
}
