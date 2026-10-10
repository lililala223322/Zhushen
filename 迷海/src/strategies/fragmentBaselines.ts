import { fragmentMaskBit, type FragmentValue } from "../domain/prizePool";
import type { Strategy } from "./types";

export type FragmentResetMode = "all" | "any";

export interface FragmentResetStrategyOptions {
  readonly id?: string;
  readonly name?: string;
  readonly fragments: readonly FragmentValue[];
  readonly mode?: FragmentResetMode;
}

function normalizeFragments(
  fragments: readonly FragmentValue[],
): readonly FragmentValue[] {
  const values = [...new Set(fragments)].sort((left, right) => left - right);
  if (values.length === 0) {
    throw new RangeError("At least one fragment value must be selected.");
  }
  return Object.freeze(values);
}

export function createFragmentResetStrategy(
  options: FragmentResetStrategyOptions,
): Strategy {
  const fragments = normalizeFragments(options.fragments);
  const mode = options.mode ?? "all";
  let requiredMask = 0;
  for (const fragment of fragments) {
    requiredMask |= fragmentMaskBit(fragment);
  }
  const connector = mode === "all" ? "_and_" : "_or_";
  const defaultId = `reset_on_${fragments.join(connector)}`;
  const readable = fragments.map(String).join(mode === "all" ? "和" : "或");
  const id = options.id ?? defaultId;

  return Object.freeze({
    id,
    name:
      options.name ??
      (mode === "all"
        ? `取得${readable}后重置`
        : `取得${readable}任一后重置`),
    description:
      mode === "all"
        ? `当前地图取得全部指定碎片（${readable}）后请求重置。`
        : `当前地图取得任一指定碎片（${readable}）后请求重置。`,
    kind: "fragment_baseline",
    definition: Object.freeze({
      type: "fragment_baseline",
      mode,
      fragments,
      requiredMask,
    }),
    decide: (state) => {
      const matches =
        mode === "all"
          ? (state.fragmentMask & requiredMask) === requiredMask
          : (state.fragmentMask & requiredMask) !== 0;
      return matches ? "reset" : "open";
    },
  } satisfies Strategy);
}

export const resetOn5Strategy = createFragmentResetStrategy({
  id: "reset_on_5",
  fragments: [5],
});
export const resetOn15Strategy = createFragmentResetStrategy({
  id: "reset_on_15",
  fragments: [15],
});
export const resetOn30Strategy = createFragmentResetStrategy({
  id: "reset_on_30",
  fragments: [30],
});
export const resetOn5And15Strategy = createFragmentResetStrategy({
  id: "reset_on_5_and_15",
  fragments: [5, 15],
  mode: "all",
});
export const resetOn5And30Strategy = createFragmentResetStrategy({
  id: "reset_on_5_and_30",
  fragments: [5, 30],
  mode: "all",
});
export const resetOn15And30Strategy = createFragmentResetStrategy({
  id: "reset_on_15_and_30",
  fragments: [15, 30],
  mode: "all",
});
export const resetOnAllFragmentsStrategy = createFragmentResetStrategy({
  id: "reset_on_all_fragments",
  name: "取得全部三种碎片后重置",
  fragments: [5, 15, 30],
  mode: "all",
});

export const resetOn5Or15Strategy = createFragmentResetStrategy({
  id: "reset_on_5_or_15",
  fragments: [5, 15],
  mode: "any",
});
export const resetOn5Or30Strategy = createFragmentResetStrategy({
  id: "reset_on_5_or_30",
  fragments: [5, 30],
  mode: "any",
});
export const resetOn15Or30Strategy = createFragmentResetStrategy({
  id: "reset_on_15_or_30",
  fragments: [15, 30],
  mode: "any",
});
export const resetOnAnyFragmentStrategy = createFragmentResetStrategy({
  id: "reset_on_any_fragment",
  name: "取得任意一种碎片后重置",
  fragments: [5, 15, 30],
  mode: "any",
});

export const FRAGMENT_BASELINE_STRATEGIES = Object.freeze([
  resetOn5Strategy,
  resetOn15Strategy,
  resetOn30Strategy,
  resetOn5And15Strategy,
  resetOn5And30Strategy,
  resetOn15And30Strategy,
  resetOnAllFragmentsStrategy,
  resetOn5Or15Strategy,
  resetOn5Or30Strategy,
  resetOn15Or30Strategy,
  resetOnAnyFragmentStrategy,
]);
