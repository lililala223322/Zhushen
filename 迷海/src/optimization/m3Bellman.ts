import type { FragmentMask } from "../domain/prizePool";
import {
  FIXED_FRAGMENTS_PER_OPEN,
  FRAGMENT_CATEGORY_INDICES,
  FULL_MAP_YIELD,
  getFragmentValue,
} from "../domain/prizePool";
import type { StrategyAction, StrategyState } from "../domain/state";

const ORDINARY_ITEMS_PER_MAP = 22;
const FRAGMENT_MASK_STATES = 8;
const INVENTORY_STATES =
  (ORDINARY_ITEMS_PER_MAP + 1) * FRAGMENT_MASK_STATES;
const FULL_FRAGMENT_MASK: FragmentMask = 7;

const ACTION_NONE = 0;
const ACTION_OPEN = 1;
const ACTION_RESET = 2;

const FRAGMENT_BITS = [
  { bit: 1, value: 5 },
  { bit: 2, value: 15 },
  { bit: 4, value: 30 },
] as const;

const FRAGMENT_COUNT_BY_MASK = new Uint8Array(
  Array.from({ length: FRAGMENT_MASK_STATES }, (_, mask) => {
    let count = 0;
    for (const fragment of FRAGMENT_BITS) {
      if ((mask & fragment.bit) !== 0) count += 1;
    }
    return count;
  }),
);

const FRAGMENT_YIELD_BY_MASK = new Uint8Array(
  Array.from({ length: FRAGMENT_MASK_STATES }, (_, mask) => {
    let value = 0;
    for (const fragment of FRAGMENT_BITS) {
      if ((mask & fragment.bit) !== 0) {
        value += FIXED_FRAGMENTS_PER_OPEN + fragment.value;
      }
    }
    return value;
  }),
);

export interface M3BellmanBuildOptions {
  readonly targetFragments?: number;
  readonly maxResets?: number;
}

export interface M3BellmanState {
  /** Positive fragments still needed; zero is accepted as a terminal query. */
  readonly gap: number;
  readonly resetsRemaining: number;
  /** Remaining non-fragment physical items in the current map. */
  readonly ordinaryRemaining: number;
  /** Bits 1/2/4 mean that the 5/15/30 fragment item remains in this map. */
  readonly remainingFragmentMask: FragmentMask;
}

export interface M3BellmanDecision {
  /** Minimum expected number of additional operation-1 actions. */
  readonly expectedOperations: number;
  /**
   * Null only for a terminal or unreachable state. Every reachable,
   * non-terminal state has an exact open/reset action.
   */
  readonly action: StrategyAction | null;
}

export interface M3BellmanSolver {
  readonly targetFragments: number;
  readonly maxResets: number;
  readonly initialExpectedOperations: number;
  query(state: M3BellmanState): M3BellmanDecision;
  value(state: M3BellmanState): number;
  optimalAction(state: M3BellmanState): StrategyAction | null;
  /**
   * Adapter for the simulator's full StrategyState. It deliberately rejects
   * non-M3 states and configurations different from the table it was built for.
   */
  decide(state: StrategyState): StrategyAction;
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function normalizeOptions(
  options: M3BellmanBuildOptions,
): Required<M3BellmanBuildOptions> {
  const targetFragments = options.targetFragments ?? 600;
  const maxResets = options.maxResets ?? 13;
  validateNonNegativeInteger(targetFragments, "targetFragments");
  validateNonNegativeInteger(maxResets, "maxResets");
  if (targetFragments === 0) {
    throw new RangeError("targetFragments must be positive.");
  }
  const stateCount =
    (targetFragments + 1) *
    (maxResets + 1) *
    INVENTORY_STATES;
  if (!Number.isSafeInteger(stateCount) || stateCount > 0xffff_ffff) {
    throw new RangeError("The requested Bellman table is too large.");
  }
  return { targetFragments, maxResets };
}

function validateState(
  state: M3BellmanState,
  targetFragments: number,
  maxResets: number,
): void {
  validateNonNegativeInteger(state.gap, "gap");
  validateNonNegativeInteger(state.resetsRemaining, "resetsRemaining");
  validateNonNegativeInteger(state.ordinaryRemaining, "ordinaryRemaining");
  validateNonNegativeInteger(
    state.remainingFragmentMask,
    "remainingFragmentMask",
  );
  if (state.gap > targetFragments) {
    throw new RangeError(`gap must be in [0, ${targetFragments}].`);
  }
  if (state.resetsRemaining > maxResets) {
    throw new RangeError(
      `resetsRemaining must be in [0, ${maxResets}].`,
    );
  }
  if (state.ordinaryRemaining > ORDINARY_ITEMS_PER_MAP) {
    throw new RangeError(
      `ordinaryRemaining must be in [0, ${ORDINARY_ITEMS_PER_MAP}].`,
    );
  }
  if (state.remainingFragmentMask >= FRAGMENT_MASK_STATES) {
    throw new RangeError("remainingFragmentMask must be in [0, 7].");
  }
}

function fragmentMaskFromInventory(
  inventory: ArrayLike<number>,
): FragmentMask {
  let mask = 0;
  if ((inventory[FRAGMENT_CATEGORY_INDICES[5]] ?? 0) > 0) mask |= 1;
  if ((inventory[FRAGMENT_CATEGORY_INDICES[15]] ?? 0) > 0) mask |= 2;
  if ((inventory[FRAGMENT_CATEGORY_INDICES[30]] ?? 0) > 0) mask |= 4;
  return mask as FragmentMask;
}

function ordinaryCountFromInventory(inventory: ArrayLike<number>): number {
  let count = 0;
  for (let categoryIndex = 0; categoryIndex < inventory.length; categoryIndex += 1) {
    if (getFragmentValue(categoryIndex) === 0) {
      count += inventory[categoryIndex] ?? 0;
    }
  }
  return count;
}

/**
 * Solves the finite-reset M3 stochastic-shortest-path problem exactly.
 *
 * M3 makes all remaining physical items equiprobable, so the 22 ordinary
 * prizes are exchangeable. The full 22-category inventory therefore collapses
 * without loss to (ordinaryRemaining, remainingFragmentMask).
 *
 * The graph is acyclic: opening removes one item, while resetting decreases
 * resetsRemaining. Filling reset layers upward and inventory sizes upward is
 * exact backward induction; no value-iteration tolerance is involved.
 */
export function buildM3BellmanSolver(
  options: M3BellmanBuildOptions = {},
): M3BellmanSolver {
  const { targetFragments, maxResets } = normalizeOptions(options);
  const gapStride = INVENTORY_STATES;
  const resetStride = (targetFragments + 1) * gapStride;
  const stateCount = (maxResets + 1) * resetStride;
  const values = new Float64Array(stateCount);
  const actions = new Uint8Array(stateCount);

  const indexOf = (
    gap: number,
    resetsRemaining: number,
    ordinaryRemaining: number,
    remainingFragmentMask: number,
  ): number =>
    resetsRemaining * resetStride +
    gap * gapStride +
    ordinaryRemaining * FRAGMENT_MASK_STATES +
    remainingFragmentMask;

  const valueAt = (
    gap: number,
    resetsRemaining: number,
    ordinaryRemaining: number,
    remainingFragmentMask: number,
  ): number =>
    gap <= 0
      ? 0
      : values[
          indexOf(
            gap,
            resetsRemaining,
            ordinaryRemaining,
            remainingFragmentMask,
          )
        ] ?? Number.POSITIVE_INFINITY;

  for (
    let resetsRemaining = 0;
    resetsRemaining <= maxResets;
    resetsRemaining += 1
  ) {
    for (let itemsRemaining = 0; itemsRemaining <= 25; itemsRemaining += 1) {
      for (
        let ordinaryRemaining = 0;
        ordinaryRemaining <= ORDINARY_ITEMS_PER_MAP;
        ordinaryRemaining += 1
      ) {
        for (
          let remainingFragmentMask = 0;
          remainingFragmentMask < FRAGMENT_MASK_STATES;
          remainingFragmentMask += 1
        ) {
          const fragmentCount =
            FRAGMENT_COUNT_BY_MASK[remainingFragmentMask] ?? 0;
          if (ordinaryRemaining + fragmentCount !== itemsRemaining) {
            continue;
          }

          const inventoryYield =
            ordinaryRemaining * FIXED_FRAGMENTS_PER_OPEN +
            (FRAGMENT_YIELD_BY_MASK[remainingFragmentMask] ?? 0);

          for (let gap = 1; gap <= targetFragments; gap += 1) {
            const index = indexOf(
              gap,
              resetsRemaining,
              ordinaryRemaining,
              remainingFragmentMask,
            );

            if (
              gap >
              inventoryYield + resetsRemaining * FULL_MAP_YIELD
            ) {
              values[index] = Number.POSITIVE_INFINITY;
              actions[index] = ACTION_NONE;
              continue;
            }

            if (itemsRemaining === 0) {
              // Reachability above guarantees resetsRemaining > 0 here.
              values[index] = valueAt(
                gap,
                resetsRemaining - 1,
                ORDINARY_ITEMS_PER_MAP,
                FULL_FRAGMENT_MASK,
              );
              actions[index] = ACTION_RESET;
              continue;
            }

            let weightedSuccessorValue = 0;
            if (ordinaryRemaining > 0) {
              weightedSuccessorValue +=
                ordinaryRemaining *
                valueAt(
                  Math.max(0, gap - FIXED_FRAGMENTS_PER_OPEN),
                  resetsRemaining,
                  ordinaryRemaining - 1,
                  remainingFragmentMask,
                );
            }
            for (const fragment of FRAGMENT_BITS) {
              if ((remainingFragmentMask & fragment.bit) === 0) continue;
              weightedSuccessorValue += valueAt(
                Math.max(
                  0,
                  gap - FIXED_FRAGMENTS_PER_OPEN - fragment.value,
                ),
                resetsRemaining,
                ordinaryRemaining,
                remainingFragmentMask & ~fragment.bit,
              );
            }
            const openValue =
              1 + weightedSuccessorValue / itemsRemaining;

            const isFreshMap =
              ordinaryRemaining === ORDINARY_ITEMS_PER_MAP &&
              remainingFragmentMask === FULL_FRAGMENT_MASK;
            const resetValue =
              resetsRemaining > 0 && !isFreshMap
                ? valueAt(
                    gap,
                    resetsRemaining - 1,
                    ORDINARY_ITEMS_PER_MAP,
                    FULL_FRAGMENT_MASK,
                  )
                : Number.POSITIVE_INFINITY;

            // Opening wins exact ties: spending a reset cannot add option value.
            if (resetValue < openValue) {
              values[index] = resetValue;
              actions[index] = ACTION_RESET;
            } else {
              values[index] = openValue;
              actions[index] = ACTION_OPEN;
            }
          }
        }
      }
    }
  }

  const query = (state: M3BellmanState): M3BellmanDecision => {
    validateState(state, targetFragments, maxResets);
    if (state.gap === 0) {
      return { expectedOperations: 0, action: null };
    }
    const index = indexOf(
      state.gap,
      state.resetsRemaining,
      state.ordinaryRemaining,
      state.remainingFragmentMask,
    );
    const expectedOperations =
      values[index] ?? Number.POSITIVE_INFINITY;
    const encodedAction = actions[index] ?? ACTION_NONE;
    const action =
      encodedAction === ACTION_OPEN
        ? "open"
        : encodedAction === ACTION_RESET
          ? "reset"
          : null;
    return { expectedOperations, action };
  };

  const decide = (state: StrategyState): StrategyAction => {
    if (state.model !== "M3") {
      throw new RangeError("The M3 Bellman solver only accepts M3 states.");
    }
    if (
      state.targetFragments !== targetFragments ||
      state.maxResets !== maxResets
    ) {
      throw new RangeError(
        "StrategyState target/maxResets do not match the Bellman table.",
      );
    }
    const gap = Math.max(0, targetFragments - state.totalFragments);
    if (gap === 0) {
      // The simulator stops before consulting a strategy at the target.
      return "open";
    }
    const decision = query({
      gap,
      resetsRemaining: state.resetsRemaining,
      ordinaryRemaining: ordinaryCountFromInventory(
        state.remainingInventory,
      ),
      remainingFragmentMask: fragmentMaskFromInventory(
        state.remainingInventory,
      ),
    });
    if (decision.action === null) {
      throw new RangeError("StrategyState is unreachable under this table.");
    }
    return decision.action;
  };

  const initialState: M3BellmanState = {
    gap: targetFragments,
    resetsRemaining: maxResets,
    ordinaryRemaining: ORDINARY_ITEMS_PER_MAP,
    remainingFragmentMask: FULL_FRAGMENT_MASK,
  };

  return Object.freeze({
    targetFragments,
    maxResets,
    initialExpectedOperations: query(initialState).expectedOperations,
    query,
    value: (state: M3BellmanState) => query(state).expectedOperations,
    optimalAction: (state: M3BellmanState) => query(state).action,
    decide,
  });
}
