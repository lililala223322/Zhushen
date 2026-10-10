import type { ModelId } from "./models";
import type { FragmentMask, FragmentValue, PrizeId } from "./prizePool";

export type StrategyAction = "open" | "reset";

/**
 * 策略在每次成功打开格子、且尚未达到目标之后收到的只读状态。
 * remainingInventory 是当前地图的实时视图；策略不得修改它或保留后再修改。
 */
export interface StrategyState {
  readonly model: ModelId;
  readonly targetFragments: number;
  readonly maxResets: number;
  readonly totalFragments: number;
  readonly operations: number;
  readonly resetsRemaining: number;
  readonly resetsUsed: number;
  readonly mapsUsed: number;
  readonly mapIndex: number;
  readonly depth: number;
  readonly fragmentMask: FragmentMask;
  readonly remainingInventory: Readonly<Uint8Array>;
  readonly lastPrizeIndex: number;
  readonly lastPrizeId: PrizeId;
  readonly lastFragmentAward: FragmentValue | 0;
}

export interface FragmentAwardCounts {
  readonly 5: number;
  readonly 15: number;
  readonly 30: number;
}

export type EpisodeFailureReason =
  | "target_unreachable_from_initial_configuration"
  | "map_exhausted_without_reset"
  | "safety_invariant_violated";

export interface EpisodeResult {
  readonly episodeIndex: number;
  readonly model: ModelId;
  readonly strategyId: string;
  readonly success: boolean;
  /** 操作1次数；失败局仍记录终止前已付出的操作数。 */
  readonly cost: number;
  readonly resetsUsed: number;
  readonly mapsUsed: number;
  readonly finalFragments: number;
  readonly overflow: number;
  readonly fragmentAwards: FragmentAwardCounts;
  readonly guardBlockedResets: number;
  readonly lastMapDepth: number;
  readonly failureReason?: EpisodeFailureReason;
}

