import type {
  StrategyDefinition,
  StrategyRuleRow,
  StrategyRuleSection,
} from "./workerTypes";

export type StrategyGroupId =
  | "recommended"
  | "probability"
  | "single"
  | "all"
  | "any"
  | "audit";

export interface StrategyCatalogEntry {
  id: string;
  code: string;
  name: string;
  shortName: string;
  group: StrategyGroupId;
  description: string;
  trigger: string;
  logic: string;
  details: string[];
  color: string;
  recommended: boolean;
  kind: StrategyDefinition["kind"];
  caveat: string;
  guardDescription: string;
  rules?: StrategyRuleRow[];
  ruleSections?: StrategyRuleSection[];
}

export const STRATEGY_GROUPS: Array<{
  id: StrategyGroupId;
  label: string;
  explanation: string;
}> = [
  {
    id: "recommended",
    label: "推荐、保守与确定基线",
    explanation: "用于最终决策的主策略、150硬上限参照和全开基线。",
  },
  {
    id: "probability",
    label: "概率与数学策略",
    explanation: "直接使用剩余奖池条件概率作决策，用于检验概率建模方法。",
  },
  {
    id: "single",
    label: "单碎片触发",
    explanation: "同一张地图取得指定的一种碎片奖励后请求重置。",
  },
  {
    id: "all",
    label: "组合触发：AND",
    explanation: "必须在同一张地图把列出的碎片全部取得，才请求重置。",
  },
  {
    id: "any",
    label: "组合触发：OR",
    explanation: "在同一张地图取得列出的任意一种碎片，就请求重置。",
  },
  {
    id: "audit",
    label: "搜索前策略与审计对照",
    explanation: "用于量化优化本身的收益，不是默认推荐。",
  },
];

const optimizedRules: StrategyRuleRow[] = [
  { fragmentMask: 0, fragmentLabel: "尚无额外碎片", maxDepth: 0, action: "continue" },
  { fragmentMask: 1, fragmentLabel: "仅 5", maxDepth: 2, action: "consider-reset" },
  { fragmentMask: 2, fragmentLabel: "仅 15", maxDepth: 5, action: "consider-reset" },
  { fragmentMask: 3, fragmentLabel: "5 + 15", maxDepth: 8, action: "consider-reset" },
  { fragmentMask: 4, fragmentLabel: "仅 30", maxDepth: 12, action: "consider-reset" },
  { fragmentMask: 5, fragmentLabel: "5 + 30", maxDepth: 15, action: "consider-reset" },
  { fragmentMask: 6, fragmentLabel: "15 + 30", maxDepth: 20, action: "consider-reset" },
  { fragmentMask: 7, fragmentLabel: "5 + 15 + 30", maxDepth: 25, action: "reset" },
];

const initialRules: StrategyRuleRow[] = [
  { fragmentMask: 0, fragmentLabel: "尚无额外碎片", maxDepth: 0, action: "continue" },
  { fragmentMask: 1, fragmentLabel: "仅 5", maxDepth: 2, action: "consider-reset" },
  { fragmentMask: 2, fragmentLabel: "仅 15", maxDepth: 5, action: "consider-reset" },
  { fragmentMask: 3, fragmentLabel: "5 + 15", maxDepth: 6, action: "consider-reset" },
  { fragmentMask: 4, fragmentLabel: "仅 30", maxDepth: 13, action: "consider-reset" },
  { fragmentMask: 5, fragmentLabel: "5 + 30", maxDepth: 14, action: "consider-reset" },
  { fragmentMask: 6, fragmentLabel: "15 + 30", maxDepth: 18, action: "consider-reset" },
  { fragmentMask: 7, fragmentLabel: "5 + 15 + 30", maxDepth: 25, action: "reset" },
];

const safeCreditWhitelistRules: StrategyRuleRow[] = [
  { fragmentMask: 0, fragmentLabel: "尚无额外碎片", maxDepth: 0, action: "continue" },
  { fragmentMask: 1, fragmentLabel: "仅 5", maxDepth: 0, action: "continue" },
  { fragmentMask: 2, fragmentLabel: "仅 15", maxDepth: 0, action: "continue" },
  { fragmentMask: 3, fragmentLabel: "5 + 15", maxDepth: 0, action: "continue" },
  { fragmentMask: 4, fragmentLabel: "仅 30", maxDepth: 1, action: "consider-reset" },
  { fragmentMask: 5, fragmentLabel: "5 + 30", maxDepth: 0, action: "continue" },
  { fragmentMask: 6, fragmentLabel: "15 + 30", maxDepth: 2, action: "consider-reset" },
  { fragmentMask: 7, fragmentLabel: "5 + 15 + 30", maxDepth: 25, action: "reset" },
];

const fragmentStateLabels = [
  "尚无额外碎片",
  "仅 5",
  "仅 15",
  "5 + 15",
  "仅 30",
  "5 + 30",
  "15 + 30",
  "5 + 15 + 30",
];

function rulesFromThresholds(thresholds: number[]): StrategyRuleRow[] {
  return thresholds.map((maxDepth, fragmentMask) => ({
    fragmentMask,
    fragmentLabel: fragmentStateLabels[fragmentMask] ?? `状态 ${fragmentMask}`,
    maxDepth,
    action:
      maxDepth === 0
        ? "continue"
        : maxDepth === 25
          ? "reset"
          : "consider-reset",
  }));
}

const optimizedRuleSections: StrategyRuleSection[] = [
  {
    title: "基础阈值（兜底）",
    description:
      "正常13次重置流程会先命中下面的剩余重置分段；本表是没有分段命中时的兜底定义。",
    rules: optimizedRules,
  },
  {
    title: "剩余重置 1–2 次",
    rules: rulesFromThresholds([0, 3, 4, 7, 12, 16, 20, 25]),
  },
  {
    title: "剩余重置 3–5 次",
    rules: rulesFromThresholds([0, 2, 4, 7, 11, 14, 18, 25]),
  },
  {
    title: "剩余重置 6–9 次",
    rules: rulesFromThresholds([0, 2, 5, 8, 12, 15, 20, 25]),
  },
  {
    title: "剩余重置 10–13 次",
    rules: rulesFromThresholds([0, 1, 5, 8, 13, 15, 20, 25]),
  },
  {
    title: "距目标 1–100 碎片（最高优先级）",
    description:
      "只要缺口落在1–100，本表覆盖基础阈值和剩余重置分段。",
    rules: rulesFromThresholds([0, 1, 4, 7, 11, 14, 19, 25]),
  },
];

const feasibilityGuard =
  "所有主动重置都受13次上限和可完成性护栏约束；若重置后理论最大碎片不足600，则继续打开。";

export const STRATEGY_OPTIONS: StrategyCatalogEntry[] = [
  {
    id: "optimized_threshold_v1",
    code: "S01",
    name: "优化进取阈值 v1",
    shortName: "优化进取",
    group: "recommended",
    description: "当前搜索空间内期望成本最低的主策略。",
    trigger:
      "按本图已取得的5/15/30组合与开格深度查阈值；剩余重置数和距目标缺口会覆盖基础阈值。",
    logic: "分段阈值",
    details: [
      "基础阈值按“无、5、15、5+15、30、5+30、15+30、全部”依次为 0 / 2 / 5 / 8 / 12 / 15 / 20 / 25。",
      "剩余重置1–2次：0 / 3 / 4 / 7 / 12 / 16 / 20 / 25；3–5次：0 / 2 / 4 / 7 / 11 / 14 / 18 / 25。",
      "剩余重置6–9次：0 / 2 / 5 / 8 / 12 / 15 / 20 / 25；10–13次：0 / 1 / 5 / 8 / 13 / 15 / 20 / 25。",
      "距600还差1–100时改为 0 / 1 / 4 / 7 / 11 / 14 / 19 / 25。当前深度不超过阈值才请求重置。",
    ],
    color: "#27d3c2",
    recommended: true,
    kind: "aggressive",
    caveat:
      "M1正式测试均值137.457；P99为151，仍有约1.03%的局超过150次。",
    guardDescription: feasibilityGuard,
    rules: optimizedRules,
    ruleSections: optimizedRuleSections,
  },
  {
    id: "optimized_conservative_150",
    code: "S02",
    name: "优化策略·保守 150",
    shortName: "优化保守",
    group: "recommended",
    description: "保留优化策略的大部分收益，同时限制最坏成本。",
    trigger:
      "先按S01判断是否想重置；只有证明从当前状态最坏也能在总成本150以内完成时，才真正重置。",
    logic: "150硬上限",
    details: [
      "基础触发条件与S01完全相同。",
      "额外检查“当前已操作次数 + 最坏剩余所需操作次数 ≤ 150”。",
      "不满足150预算时忽略S01的重置请求，继续打开当前地图。",
    ],
    color: "#8fa8ff",
    recommended: false,
    kind: "conservative",
    caveat:
      "M1正式测试均值139.285，比S01多1.828次；正式样本中没有超过150次。",
    guardDescription:
      `${feasibilityGuard} 此外还必须通过150次最坏成本预算。`,
    rules: optimizedRules,
    ruleSections: optimizedRuleSections,
  },
  {
    id: "expected_gain_greedy_gap",
    code: "S18",
    name: "一步期望收益贪心 G0",
    shortName: "期望贪心G0",
    group: "probability",
    description:
      "逐格使用完整剩余奖池概率，但只比较下一次操作的期望有效碎片。",
    trigger:
      "计算当前地图下一抽与全新地图下一抽的期望有效碎片；若新地图严格更高，则请求重置，平局继续。",
    logic: "一步期望收益",
    details: [
      "M1按仍有库存的类别展示权重重归一化；M2按剩余份数乘展示权重；M3按剩余物品均匀抽取。",
      "临近600时，一次抽取超过剩余缺口的部分不再计入“有效碎片”，避免用无效溢出抬高期望。",
      "每次判断都使用完整剩余库存，因此挖掉哪一种普通奖励也可能改变决定。",
      "这是G0短视基线：不计算后续多步选择权，也没有为稀缺重置名额设置影子价格。",
    ],
    color: "#22a6d5",
    recommended: false,
    kind: "aggressive",
    caveat:
      "100,000局中M1/M2/M3均值为138.314/140.424/119.649，均略差于S01；M1/M2的P(>150)为2.148%/3.695%。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "safe_credit_whitelist",
    code: "S17",
    name: "150保底安全白名单",
    shortName: "安全白名单",
    group: "recommended",
    description:
      "不需要S01分段表或累计信用计算，也能结构性保证150次内达到600。",
    trigger:
      "第1格取得30，或前2格已取得15和30时请求重置；其他情况只在5、15、30全部取得后重置。",
    logic: "150保底白名单",
    details: [
      "第1格取得30：立即请求重置。",
      "第2格结束前已经同时取得15和30：立即请求重置。",
      "不属于前两条时，必须等本图5、15、30全部取得后才请求重置。",
      "每个允许丢弃的地图前缀都已赚足补偿最坏后续排列的碎片信用，因此150次至少600不是样本推断。",
    ],
    color: "#48b5a3",
    recommended: false,
    kind: "conservative",
    caveat:
      "规则显著简单于S02，但50,000局确认中达到600的M1/M2均值为142.816/144.578次，比S02-U11约多3.5/3.1次。",
    guardDescription:
      `${feasibilityGuard} 白名单自身还提供150次达到600的结构性保证。`,
    rules: safeCreditWhitelistRules,
    ruleSections: [
      {
        title: "150保底安全白名单",
        description:
          "只有下列三类碎片状态与深度允许提前重置；其余状态一律继续打开。",
        rules: safeCreditWhitelistRules,
      },
    ],
  },
  {
    id: "full_clear",
    code: "S04",
    name: "全开基线",
    shortName: "全开",
    group: "recommended",
    description: "没有随机尾部，用作所有策略的确定基准。",
    trigger: "不主动提前重置；每张地图25格全部打开，再进入下一张地图。",
    logic: "固定基线",
    details: [
      "一张完整地图固定获得100碎片。",
      "从0到600正好完整打开6张地图，操作1固定为150次。",
    ],
    color: "#8b96a8",
    recommended: false,
    kind: "baseline",
    caveat: "结果恒为150，但放弃提前拿到高价值碎片后重置所带来的均值收益。",
    guardDescription: "开满地图且尚未达到600时，才使用一次重置进入下一张图。",
  },
  {
    id: "reset_on_5",
    code: "S06",
    name: "取得 5 后重置",
    shortName: "5重置",
    group: "single",
    description: "只看5碎片奖励。",
    trigger: "同一张地图首次取得“碎片5”后，立即请求重置。",
    logic: "单条件",
    details: ["取得15或30不会触发；只有取得5才触发。"],
    color: "#f29e74",
    recommended: false,
    kind: "baseline",
    caveat: "规则简单，但5碎片价值较低，可能过早消耗重置次数。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_15",
    code: "S07",
    name: "取得 15 后重置",
    shortName: "15重置",
    group: "single",
    description: "只看15碎片奖励。",
    trigger: "同一张地图首次取得“碎片15”后，立即请求重置。",
    logic: "单条件",
    details: ["取得5或30不会触发；只有取得15才触发。"],
    color: "#e3c565",
    recommended: false,
    kind: "baseline",
    caveat: "没有利用取得时的开格深度，也忽略其他碎片组合。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_30",
    code: "S03",
    name: "取得 30 后重置",
    shortName: "30重置",
    group: "single",
    description: "简单且较有竞争力的手动对照。",
    trigger: "同一张地图首次取得“碎片30”后，立即请求重置。",
    logic: "单条件",
    details: ["取得5或15不会触发；只有取得30才触发。"],
    color: "#f4b860",
    recommended: false,
    kind: "baseline",
    caveat: "M1正式测试均值140.653；没有利用深度，约8.28%的局超过150次。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_5_and_15",
    code: "S08",
    name: "取得 5 和 15 后重置",
    shortName: "5+15 AND",
    group: "all",
    description: "两种奖励必须都在本图取得。",
    trigger: "同一张地图已经同时取得碎片5和碎片15后，请求重置。",
    logic: "AND·全部",
    details: ["只取得5不触发；只取得15不触发；先后顺序不限。"],
    color: "#66c2a5",
    recommended: false,
    kind: "baseline",
    caveat: "“和”是全部满足，不是取得任意一个。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_5_and_30",
    code: "S09",
    name: "取得 5 和 30 后重置",
    shortName: "5+30 AND",
    group: "all",
    description: "两种奖励必须都在本图取得。",
    trigger: "同一张地图已经同时取得碎片5和碎片30后，请求重置。",
    logic: "AND·全部",
    details: ["只取得5不触发；只取得30不触发；先后顺序不限。"],
    color: "#5ab4ac",
    recommended: false,
    kind: "baseline",
    caveat: "“和”是全部满足，不是取得任意一个。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_15_and_30",
    code: "S10",
    name: "取得 15 和 30 后重置",
    shortName: "15+30 AND",
    group: "all",
    description: "两种奖励必须都在本图取得。",
    trigger: "同一张地图已经同时取得碎片15和碎片30后，请求重置。",
    logic: "AND·全部",
    details: ["只取得15不触发；只取得30不触发；先后顺序不限。"],
    color: "#4f9da6",
    recommended: false,
    kind: "baseline",
    caveat: "“和”是全部满足，不是取得任意一个。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_all_fragments",
    code: "S11",
    name: "取得 5、15、30 全部后重置",
    shortName: "全部 AND",
    group: "all",
    description: "三种奖励必须都在本图取得。",
    trigger: "同一张地图已经取得碎片5、15、30三种奖励后，请求重置。",
    logic: "AND·全部",
    details: ["缺少任意一种都不触发；三种取得顺序不限。"],
    color: "#3c8d9e",
    recommended: false,
    kind: "baseline",
    caveat: "通常触发较晚，提前重置机会较少。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_5_or_15",
    code: "S12",
    name: "取得 5 或 15 任一后重置",
    shortName: "5|15 OR",
    group: "any",
    description: "取得任意一种就触发。",
    trigger: "同一张地图首次取得碎片5或碎片15中的任意一种后，请求重置。",
    logic: "OR·任一",
    details: ["取得5会触发；取得15也会触发；不需要两种都取得。"],
    color: "#d98cb3",
    recommended: false,
    kind: "baseline",
    caveat: "OR策略通常更早触发，可能更快消耗重置次数。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_5_or_30",
    code: "S13",
    name: "取得 5 或 30 任一后重置",
    shortName: "5|30 OR",
    group: "any",
    description: "取得任意一种就触发。",
    trigger: "同一张地图首次取得碎片5或碎片30中的任意一种后，请求重置。",
    logic: "OR·任一",
    details: ["取得5会触发；取得30也会触发；不需要两种都取得。"],
    color: "#c979a7",
    recommended: false,
    kind: "baseline",
    caveat: "OR策略通常更早触发，可能更快消耗重置次数。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_15_or_30",
    code: "S14",
    name: "取得 15 或 30 任一后重置",
    shortName: "15|30 OR",
    group: "any",
    description: "取得任意一种就触发。",
    trigger: "同一张地图首次取得碎片15或碎片30中的任意一种后，请求重置。",
    logic: "OR·任一",
    details: ["取得15会触发；取得30也会触发；不需要两种都取得。"],
    color: "#b86e9e",
    recommended: false,
    kind: "baseline",
    caveat: "比单独等30更容易触发，但也更快消耗重置次数。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "reset_on_any_fragment",
    code: "S15",
    name: "取得任意碎片奖励后重置",
    shortName: "任一 OR",
    group: "any",
    description: "5、15、30任意一种都会触发。",
    trigger: "同一张地图首次取得碎片5、15、30中的任意一种后，请求重置。",
    logic: "OR·任一",
    details: ["这是四条OR基线中最容易触发的一条。"],
    color: "#a96093",
    recommended: false,
    kind: "baseline",
    caveat: "可能非常早地耗费重置次数；可完成性护栏会阻止危险重置。",
    guardDescription: feasibilityGuard,
  },
  {
    id: "aggressive_threshold",
    code: "S05",
    name: "搜索前的初始进取阈值",
    shortName: "初始阈值",
    group: "audit",
    description: "优化搜索的起点，用于审计新增复杂度是否值得。",
    trigger: "仅按本图已取得的碎片组合与开格深度查固定阈值，不使用重置数或目标缺口分段。",
    logic: "固定阈值",
    details: [
      "按“无、5、15、5+15、30、5+30、15+30、全部”的阈值依次为 0 / 2 / 5 / 6 / 13 / 14 / 18 / 25。",
      "当前深度不超过对应阈值时请求重置。",
    ],
    color: "#dd7bdc",
    recommended: false,
    kind: "aggressive",
    caveat: "既有候选验证中均值只比S01高约0.047次，且P99略低；保留作重要审计对照，未冒充正式四策略结果。",
    guardDescription: feasibilityGuard,
    rules: initialRules,
    ruleSections: [
      {
        title: "固定阈值",
        description: "S05不按剩余重置或目标缺口分段。",
        rules: initialRules,
      },
    ],
  },
  {
    id: "conservative_150",
    code: "S16",
    name: "初始阈值·保守 150",
    shortName: "初始保守",
    group: "audit",
    description: "初始阈值策略的150次硬上限版本。",
    trigger:
      "先按S05判断；只有证明最坏情况下总成本仍不超过150时，才真正重置。",
    logic: "150硬上限",
    details: [
      "基础触发条件与S05完全相同。",
      "不满足150预算时继续打开当前地图。",
    ],
    color: "#a48be0",
    recommended: false,
    kind: "conservative",
    caveat: "用于区分阈值优化与硬上限包装各自带来的影响。",
    guardDescription:
      `${feasibilityGuard} 此外还必须通过150次最坏成本预算。`,
    rules: initialRules,
    ruleSections: [
      {
        title: "S05基础触发阈值",
        description: "通过本表提出重置请求后，还必须通过150次预算。",
        rules: initialRules,
      },
    ],
  },
];

export const STRATEGY_DEFINITIONS: StrategyDefinition[] =
  STRATEGY_OPTIONS.map((strategy) => ({
    id: strategy.id,
    code: strategy.code,
    name: strategy.name,
    shortName: strategy.shortName,
    kind: strategy.kind,
    group: strategy.group,
    logic: strategy.logic,
    trigger: strategy.trigger,
    details: strategy.details,
    summary: `${strategy.trigger} ${strategy.description}`,
    caveat: strategy.caveat,
    guardDescription: strategy.guardDescription,
    rules: strategy.rules ?? [],
    ruleSections: strategy.ruleSections,
  }));
