import type { GrowthBuildInput } from "../types/build";
import type { Trait, TraitAvailability, TraitPrerequisite } from "../types/trait";
import type { RuleDataSnapshot } from "../rules/rule-data";
import { traitRaceForBloodline } from "../rules/rule-data";

export function parseHybridTraitName(name: string): { displayName: string; prerequisiteName: string; suffixRace: string } | null {
  const match = String(name || "").match(/^(.+?)（(.+?)）([^（）]*)$/);
  if (!match) return null;
  return {
    displayName: match[1]!,
    prerequisiteName: match[2]!,
    suffixRace: match[3]!.trim(),
  };
}

export function displayTraitName(trait: Trait): string {
  return trait.display?.displayName || parseHybridTraitName(trait.name)?.displayName || trait.name;
}

export function traitPrerequisites(data: RuleDataSnapshot, trait: Trait): TraitPrerequisite[] {
  if (trait.prerequisites?.length) return trait.prerequisites;
  if (trait.type !== "divine_trait") return [];
  const parsed = parseHybridTraitName(trait.name);
  if (!parsed) return [];
  const mortal = data.traits.find((item) => item.type === "mortal_trait" && item.name === parsed.prerequisiteName);
  if (!mortal) {
    return [{ kind: "trait", traitId: `missing:${parsed.prerequisiteName}` }];
  }
  const requirements: TraitPrerequisite[] = [{ kind: "trait", traitId: mortal.id }];
  if (mortal.race || parsed.suffixRace) {
    requirements.push({ kind: "bloodlineRace", race: mortal.race || parsed.suffixRace });
  }
  return requirements;
}

export function hasBloodlineTraitRace(data: RuleDataSnapshot, input: Pick<GrowthBuildInput, "bloodlines">, race: string): boolean {
  if (!race) return false;
  return input.bloodlines.some((row) => traitRaceForBloodline(data, row.race) === race);
}

export function getTraitAvailability(data: RuleDataSnapshot, input: GrowthBuildInput, traitId: string): TraitAvailability {
  const trait = data.traits.find((item) => item.id === traitId) as Trait | undefined;
  if (!trait) {
    return {
      available: false,
      displayName: traitId,
      prerequisites: [],
      reasons: [{ code: "TRAIT_NOT_FOUND", message: `未找到特性：${traitId}` }],
    };
  }

  const prerequisites = traitPrerequisites(data, trait);
  const reasons = prerequisites.flatMap((requirement) => {
    if (requirement.kind === "bloodlineRace") {
      return hasBloodlineTraitRace(data, input, requirement.race)
        ? []
        : [{ code: "MISSING_BLOODLINE_RACE", message: `需要${requirement.race}血脉` }];
    }
    if (requirement.traitId.startsWith("missing:")) {
      const name = requirement.traitId.slice("missing:".length);
      return [{ code: "PREREQUISITE_TRAIT_NOT_REGISTERED", message: `前置特性未录入：${name}` }];
    }
    return input.traitIds.includes(requirement.traitId)
      ? []
      : [{ code: "MISSING_PREREQUISITE_TRAIT", message: `需要先选择凡人特性：${traitNameById(data, requirement.traitId)}` }];
  });

  return {
    available: reasons.length === 0,
    reasons,
    displayName: displayTraitName(trait),
    prerequisites,
  };
}

function traitNameById(data: RuleDataSnapshot, traitId: string): string {
  return data.traits.find((trait) => trait.id === traitId)?.name || traitId;
}
