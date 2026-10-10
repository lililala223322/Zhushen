import type { StatVector } from "./stat";

export type TraitType = "divine_skill" | "divine_trait" | "mortal_trait" | "saint_trait";

export type TraitPrerequisite =
  | { kind: "trait"; traitId: string }
  | { kind: "bloodlineRace"; race: string };

export interface TraitDisplayMeta {
  effectText?: string;
  lifespanText?: string;
  displayName?: string;
}

export interface Trait {
  id: string;
  name: string;
  type: TraitType;
  race: string;
  part: string;
  flatStats: StatVector;
  multiplierStats: StatVector;
  potentialBonus: StatVector;
  divineCombatValue: StatVector;
  prerequisites?: TraitPrerequisite[];
  display?: TraitDisplayMeta;
}

export interface TraitAvailabilityReason {
  code: string;
  message: string;
}

export interface TraitAvailability {
  available: boolean;
  reasons: TraitAvailabilityReason[];
  warnings?: TraitAvailabilityReason[];
  displayName: string;
  prerequisites: TraitPrerequisite[];
}

export interface SaintTraitGroup {
  id: "mark" | "role";
  label: "圣印" | "身份";
  maxSelected: 1;
  traitIds: string[];
}
