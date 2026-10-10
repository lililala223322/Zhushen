import type { StatVector } from "./stat";

export type Sex = "男" | "女";

export interface BloodlineInput {
  race: string;
  percent: number;
}

export interface CurrentStateInput {
  enabled: boolean;
  currentLevel: number;
  className: string;
  stats: StatVector;
}

export interface GrowthSegmentInput {
  fromLevel: number;
  toLevel: number;
  className: string;
}

export interface GrowthBuildInput {
  sex: Sex;
  level: number;
  bloodlines: BloodlineInput[];
  characterPotential: StatVector;
  currentState?: CurrentStateInput;
  growthSegments: GrowthSegmentInput[];
  traitIds: string[];
  equipmentStats: StatVector;
  finalClass: string;
}
