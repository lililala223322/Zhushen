import type { StrategyAction, StrategyState } from "../domain/state";

export type StrategyKind =
  | "full_clear"
  | "fragment_baseline"
  | "threshold"
  | "expected_gain"
  | "conservative_wrapper";

export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: StrategyKind;
  /** JSON-safe public description used by exports and reports. */
  readonly definition: Readonly<Record<string, unknown>>;
  decide(state: StrategyState): StrategyAction;
}
