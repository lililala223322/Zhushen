import type { StatVector } from "../types/stat";
import type { Trait, TraitType } from "../types/trait";

export interface RuleDataSnapshot {
  stats: string[];
  statLabels: Record<string, string>;
  races: Record<string, Record<string, StatVector>>;
  commonerRace: string;
  bloodlineTraitRaceMap: Record<string, string>;
  classGrowth: Record<string, StatVector>;
  classValues: Record<string, StatVector>;
  classEquipment: Record<string, { weapons?: string[]; armor?: string }>;
  traits: Array<Trait | LegacyTrait>;
}

export interface LegacyTrait {
  id: string;
  name: string;
  type: TraitType;
  race: string;
  part: string;
  flatStats: StatVector;
  multiplierStats: StatVector;
  potentialBonus: StatVector;
  divineCombatValue: StatVector;
  effectText?: string;
  lifespanText?: string;
}

export function traitRaceForBloodline(data: RuleDataSnapshot, race: string): string {
  return data.bloodlineTraitRaceMap?.[race] || race;
}
