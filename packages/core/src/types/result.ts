import type { GrowthBuildInput, GrowthSegmentInput } from "./build";
import type { StatKey, StatVector } from "./stat";
import type { Trait } from "./trait";
import type { BloodlineSummary } from "../growth/potential";

export interface GrowthSegmentBreakdown extends GrowthSegmentInput {
  adjustedFromLevel: number;
  adjustedToLevel: number;
  effectiveLevels: number;
  before60Levels: number;
  after60Levels: number;
  classPotential: StatVector;
  contribution: StatVector;
}

export interface StatBreakdown {
  basePotential: number;
  bloodlinePotential: number;
  traitPotentialBonus: number;
  finalCharacterPotential: number;
  weightedFinalPotential: number;
  currentGrowth: number;
  ordinaryGrowth: number;
  divineCombatValue: number;
  divineCombatAdd: number;
  traitFlat: number;
  equipment: number;
  classValue: number;
  multiplier: number;
  multiplierBonus: number;
  normalInside: number;
  combatInside: number;
  normal: number;
  combat: number;
  normalFormula: string;
  combatFormula: string;
}

export interface GrowthResult {
  input: GrowthBuildInput;
  selectedTraits: Trait[];
  effectiveTraits: Trait[];
  overriddenMortalTraits: Trait[];
  bloodlineSummary: BloodlineSummary[];
  potentialLimit: StatVector;
  basePotential: StatVector;
  currentGrowth: StatVector;
  finalCharacterPotential: StatVector;
  traitPotentialBonus: StatVector;
  weightedFinalPotential: StatVector;
  traitFlat: StatVector;
  traitMultiplierBonus: StatVector;
  divineCombatValue: StatVector;
  segmentBreakdowns: GrowthSegmentBreakdown[];
  normalStats: StatVector;
  combatStats: StatVector;
  breakdown: Record<StatKey, StatBreakdown>;
  warnings: string[];
}
