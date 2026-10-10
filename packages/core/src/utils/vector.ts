import { statKeys, type StatVector } from "../types/stat";

export function zeroVector(): StatVector {
  return Object.fromEntries(statKeys.map((stat) => [stat, 0])) as StatVector;
}

export function hasAnyStat(vector: Partial<StatVector> | undefined): boolean {
  return statKeys.some((stat) => Math.abs(Number(vector?.[stat]) || 0) > 1e-9);
}

export function vectorHasStat(source: Partial<StatVector> | undefined, stat: keyof StatVector): boolean {
  return Math.abs(Number(source?.[stat]) || 0) > 1e-9;
}

export function addInto(target: StatVector, source: Partial<StatVector> | undefined, scale = 1): StatVector {
  statKeys.forEach((stat) => {
    target[stat] += (Number(source?.[stat]) || 0) * scale;
  });
  return target;
}

export function cloneVector(source: Partial<StatVector> | undefined): StatVector {
  return Object.assign(zeroVector(), source || {});
}

export function vectorSum<T>(items: T[], key: keyof T): StatVector {
  const result = zeroVector();
  items.forEach((item) => addInto(result, item[key] as Partial<StatVector> | undefined));
  return result;
}
