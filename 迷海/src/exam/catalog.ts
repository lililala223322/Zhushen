import { STRATEGY_OPTIONS } from "../ui/strategyCatalog";
import {
  FIXED_HORIZON_CORE_BY_STRATEGY_ID,
  type FixedHorizonCoreStrategyId,
} from "./fixedHorizon";

export interface FixedHorizonExamStrategyOption {
  id: FixedHorizonCoreStrategyId;
  code: string;
  name: string;
  description: string;
  color: string;
  group: "threshold" | "single" | "all" | "any" | "baseline";
}

const EXCLUDED_WRAPPERS = new Set([
  "optimized_conservative_150",
  "conservative_150",
]);

function examGroup(
  group: string,
): FixedHorizonExamStrategyOption["group"] {
  if (group === "single" || group === "all" || group === "any") return group;
  if (group === "recommended" || group === "audit") return "threshold";
  return "baseline";
}

export const FIXED_HORIZON_EXAM_STRATEGIES: FixedHorizonExamStrategyOption[] =
  STRATEGY_OPTIONS.filter(
    (strategy) =>
      !EXCLUDED_WRAPPERS.has(strategy.id) &&
      Object.hasOwn(FIXED_HORIZON_CORE_BY_STRATEGY_ID, strategy.id),
  ).map((strategy) => {
    const id = FIXED_HORIZON_CORE_BY_STRATEGY_ID[
      strategy.id as keyof typeof FIXED_HORIZON_CORE_BY_STRATEGY_ID
    ];
    const isV1 = id === "optimized_threshold_v1";
    return {
      id,
      code: strategy.code,
      name: isV1 ? "S01核心·重置分段阈值" : strategy.name,
      description: isV1
        ? "去除600缺口覆盖层，仅按碎片组合、深度和剩余重置分段评分。"
        : strategy.description,
      color: strategy.color,
      group:
        id === "full_clear" ? "baseline" : examGroup(strategy.group),
    };
  });

export const FIXED_HORIZON_EXAM_STRATEGY_BY_ID = new Map(
  FIXED_HORIZON_EXAM_STRATEGIES.map((strategy) => [strategy.id, strategy]),
);

export const FIXED_HORIZON_WRAPPER_ALIASES = Object.freeze([
  {
    wrapperId: "optimized_conservative_150",
    wrapperCode: "S02",
    coreId: "optimized_threshold_v1",
    explanation:
      "S02的150硬上限依赖600目标；目标移除后，其采集核心与S01核心相同。",
  },
  {
    wrapperId: "conservative_150",
    wrapperCode: "S16",
    coreId: "aggressive_threshold",
    explanation:
      "S16的150硬上限依赖600目标；目标移除后，其采集核心与S05相同。",
  },
] as const);

export const DEFAULT_FIXED_HORIZON_STRATEGY_IDS: FixedHorizonCoreStrategyId[] = [
  "optimized_threshold_v1",
  "aggressive_threshold",
  "reset_on_30",
  "full_clear",
];
