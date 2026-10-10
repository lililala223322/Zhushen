import type { Trait } from "../types/trait";

export function normalizedTraitPart(part: string | undefined): string {
  return String(part || "").trim().replace(/\++$/g, "");
}

export function divineTraitOverridesMortalTrait(divineTrait: Trait, mortalTrait: Trait): boolean {
  const divinePart = normalizedTraitPart(divineTrait.part);
  const mortalPart = normalizedTraitPart(mortalTrait.part);
  return divineTrait.type === "divine_trait"
    && mortalTrait.type === "mortal_trait"
    && Boolean(divinePart)
    && divinePart === mortalPart;
}

export function overriddenMortalTraits(selectedTraits: Trait[]): Trait[] {
  const divineTraits = selectedTraits.filter((trait) => trait.type === "divine_trait");
  return selectedTraits.filter((trait) => (
    trait.type === "mortal_trait"
    && divineTraits.some((divineTrait) => divineTraitOverridesMortalTrait(divineTrait, trait))
  ));
}

export function overridingDivineTraitForMortal(selectedTraits: Trait[], mortalTrait: Trait): Trait | undefined {
  return selectedTraits.find((trait) => divineTraitOverridesMortalTrait(trait, mortalTrait));
}

export function effectiveTraitsForCalculation(selectedTraits: Trait[]): Trait[] {
  const overriddenIds = new Set(overriddenMortalTraits(selectedTraits).map((trait) => trait.id));
  return selectedTraits.filter((trait) => !overriddenIds.has(trait.id));
}

export function hasBlockingTraitPartConflict(traits: Trait[]): boolean {
  for (let i = 0; i < traits.length; i += 1) {
    const first = traits[i]!;
    if (first.type === "saint_trait") continue;
    const firstPart = normalizedTraitPart(first.part);
    if (!firstPart) continue;
    for (let j = i + 1; j < traits.length; j += 1) {
      const second = traits[j]!;
      if (second.type === "saint_trait") continue;
      if (firstPart !== normalizedTraitPart(second.part)) continue;
      if (
        divineTraitOverridesMortalTrait(first, second)
        || divineTraitOverridesMortalTrait(second, first)
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}
