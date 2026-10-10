import type {
  DecisionReportInput,
  PairedComparisonMetrics,
  PolicyDefinition,
  SummaryMetrics,
} from "./types";

function number(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function percent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function markdownTable(headers: string[], rows: string[][]): string {
  const separator = headers.map(() => "---");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function eligibleM1Summaries(summaries: SummaryMetrics[]): SummaryMetrics[] {
  return summaries
    .filter(
      (summary) =>
        summary.modelId === "M1" &&
        summary.failureRate === 0 &&
        summary.strategyId !== "full_clear",
    )
    .sort((left, right) => left.mean - right.mean);
}

function findPolicy(policies: PolicyDefinition[], strategyId: string): PolicyDefinition | undefined {
  return policies.find((policy) => policy.id === strategyId);
}

function findComparison(
  comparisons: PairedComparisonMetrics[],
  candidate: string,
  baseline: string,
  modelId = "M1",
): PairedComparisonMetrics | undefined {
  return comparisons.find(
    (comparison) =>
      comparison.candidateStrategyId === candidate &&
      comparison.baselineStrategyId === baseline &&
      comparison.modelId === modelId,
  );
}

function comparisonSentence(comparison: PairedComparisonMetrics | undefined): string {
  if (!comparison) return "本次运行未生成对应的成对比较。";
  const direction = comparison.meanDifference <= 0 ? "少" : "多";
  return `平均${direction} ${number(Math.abs(comparison.meanDifference))} 次（候选−基线的 95% CI：${number(comparison.ci95Low)} 至 ${number(comparison.ci95High)}），胜/平/负为 ${percent(comparison.winRate)} / ${percent(comparison.tieRate)} / ${percent(comparison.lossRate)}。`;
}

function summaryRows(summaries: SummaryMetrics[]): string[][] {
  return [...summaries]
    .sort(
      (left, right) =>
        left.modelId.localeCompare(right.modelId) ||
        left.mean - right.mean,
    )
    .map((summary) => [
      summary.modelId,
      summary.strategyName,
      summary.episodes.toLocaleString("en-US"),
      number(summary.mean),
      `[${number(summary.ci95Low)}, ${number(summary.ci95High)}]`,
      number(summary.p50, 0),
      number(summary.p90, 0),
      number(summary.p95, 0),
      number(summary.p99, 0),
      number(summary.cvar95),
      percent(summary.probabilityGt150),
      percent(summary.failureRate, 4),
    ]);
}

function comparisonRows(comparisons: PairedComparisonMetrics[]): string[][] {
  return comparisons.map((comparison) => [
    comparison.modelId,
    `${comparison.candidateStrategyId} − ${comparison.baselineStrategyId}`,
    number(comparison.meanDifference),
    `[${number(comparison.ci95Low)}, ${number(comparison.ci95High)}]`,
    percent(comparison.winRate),
    percent(comparison.tieRate),
    percent(comparison.lossRate),
    number(comparison.meanWinningMargin),
    number(comparison.meanLosingMargin),
  ]);
}

function renderPolicy(policy: PolicyDefinition | undefined): string {
  if (!policy) return "未找到导出的策略定义。";
  const rule = policy.playerRule ?? policy.description;
  return [
    `- 名称：${policy.name}（\`${policy.id}\`）`,
    `- 玩家规则：${rule}`,
    `- 参数：\`${JSON.stringify(policy.parameters ?? {}, null, 0)}\``,
  ].join("\n");
}

function nearTargetPolicySentence(policy: PolicyDefinition | undefined): string {
  if (
    policy?.parameters === null ||
    typeof policy?.parameters !== "object"
  ) {
    return "没有导出碎片缺口分段；只由可完成性护栏在接近目标时收紧重置。";
  }
  const parameters = policy.parameters as {
    thresholds?: unknown;
    deficitBands?: unknown;
  };
  if (
    !Array.isArray(parameters.thresholds) ||
    !Array.isArray(parameters.deficitBands)
  ) {
    return "没有导出碎片缺口分段；只由可完成性护栏在接近目标时收紧重置。";
  }
  const band = parameters.deficitBands.find(
    (candidate): candidate is {
      min: number;
      max: number;
      thresholds: number[];
    } =>
      candidate !== null &&
      typeof candidate === "object" &&
      "min" in candidate &&
      "max" in candidate &&
      "thresholds" in candidate &&
      Array.isArray(candidate.thresholds),
  );
  if (!band) {
    return "没有导出碎片缺口分段；只由可完成性护栏在接近目标时收紧重置。";
  }
  const base = parameters.thresholds as number[];
  const stricter = band.thresholds.filter(
    (threshold, index) => threshold < (base[index] ?? threshold),
  ).length;
  const looser = band.thresholds.filter(
    (threshold, index) => threshold > (base[index] ?? threshold),
  ).length;
  const unchanged = band.thresholds.length - stricter - looser;
  return `会。距目标 ${band.min}–${band.max} 碎片时，8状态阈值改为 [${band.thresholds.join(
    ", ",
  )}]；相对基础阈值有 ${stricter} 个状态更保守、${looser} 个更激进、${unchanged} 个不变。`;
}

export function buildDecisionReport(input: DecisionReportInput): string {
  const candidates = eligibleM1Summaries(input.summaries);
  const recommendation = candidates[0];
  const runnerUp = candidates[1];
  const policy = recommendation
    ? findPolicy(input.policies, recommendation.strategyId)
    : undefined;
  const vsFullClear = recommendation
    ? findComparison(input.comparisons, recommendation.strategyId, "full_clear")
    : undefined;
  const vsReset30 = recommendation
    ? findComparison(input.comparisons, recommendation.strategyId, "reset_on_30")
    : undefined;
  const conservative = input.summaries.find(
    (summary) =>
      summary.modelId === "M1" &&
      (summary.strategyId.includes("conservative") ||
        summary.strategyId.includes("hard_150")),
  );
  const vsConservative =
    recommendation && conservative
      ? findComparison(
          input.comparisons,
          recommendation.strategyId,
          conservative.strategyId,
        )
      : undefined;
  const sensitivity = recommendation
    ? input.summaries.filter(
        (summary) => summary.strategyId === recommendation.strategyId,
      )
    : [];
  const alternativeModelSensitivity = sensitivity.filter(
    (summary) => summary.modelId !== "M1",
  );

  const lines: string[] = [
    "# 迷海寻宝策略正式评估报告",
    "",
    "## 一页结论摘要",
    "",
  ];

  if (!recommendation) {
    lines.push(
      "本次结果中没有找到同时满足 M1、零失败且非全开基线的策略，不能给出进取版推荐。请检查模拟配置和失败局。",
    );
  } else {
    lines.push(
      `在本次预先固定的候选策略空间与独立正式测试种子中，M1 下表现最好的零失败进取策略是 **${recommendation.strategyName}**。它平均需要 **${number(recommendation.mean)}** 次操作1（95% CI ${number(recommendation.ci95Low)}–${number(recommendation.ci95High)}），相对150次全开基线平均节省 **${number(recommendation.meanSavingsVs150)} 次（${number(recommendation.meanSavingsPercentVs150, 2)}%）**。这是“当前已搜索候选空间内最优”，不是未经证明的全局最优。`,
      "",
      `其中位数/P90/P95/P99 为 **${number(recommendation.p50, 0)} / ${number(recommendation.p90, 0)} / ${number(recommendation.p95, 0)} / ${number(recommendation.p99, 0)}**；超过150/155/160次的概率为 **${percent(recommendation.probabilityGt150)} / ${percent(recommendation.probabilityGt155)} / ${percent(recommendation.probabilityGt160)}**。最差5%与1%的平均成本（CVaR95/CVaR99）为 **${number(recommendation.cvar95)} / ${number(recommendation.cvar99)}**。`,
    );
  }

  lines.push(
    "",
    "## 主推荐策略与玩家规则",
    "",
    renderPolicy(policy),
    "",
    "任何主动重置仍须通过可完成性护栏：重置后剩余完整地图的最大碎片总量必须足以达到600；否则继续打开当前地图。达到600立即停止。",
    "",
    "## 决策问题",
    "",
  );

  if (recommendation) {
    const lowCost = recommendation.lowCostFragmentAverages;
    lines.push(
      `1. **M1 下谁的期望操作最少？** ${recommendation.strategyName}，均值 ${number(recommendation.mean)}；范围仅限本次实际评估的策略。`,
      `2. **相对150次全开节省多少？** ${number(recommendation.meanSavingsVs150)} 次，${number(recommendation.meanSavingsPercentVs150, 2)}%。`,
      `3. **相对“抽到30即重置”节省多少？** ${comparisonSentence(vsReset30)}`,
      `4. **50%/75%/90%/95%/99%在多少次内完成？** ${number(recommendation.p50, 0)} / ${number(recommendation.p75, 0)} / ${number(recommendation.p90, 0)} / ${number(recommendation.p95, 0)} / ${number(recommendation.p99, 0)}。`,
      `5. **少于120/130/140/150次的概率？** ${percent(recommendation.probabilityLt120)} / ${percent(recommendation.probabilityLt130)} / ${percent(recommendation.probabilityLt140)} / ${percent(recommendation.probabilityLt150)}。`,
      `6. **超过150/155/160次的概率？** ${percent(recommendation.probabilityGt150)} / ${percent(recommendation.probabilityGt155)} / ${percent(recommendation.probabilityGt160)}。`,
      `7. **最差5%/1%的平均成本？** ${number(recommendation.cvar95)} / ${number(recommendation.cvar99)}。`,
      `8. **重置使用情况？** 平均 ${number(recommendation.meanResets)} 次，P50/P95 为 ${number(recommendation.resetP50, 0)} / ${number(recommendation.resetP95, 0)}，13次全部用完概率 ${percent(recommendation.probabilityAllResetsUsed)}。`,
      `9. **低成本局通常取得多少碎片奖？** ${lowCost.map((row) => `${row.label}: 5/15/30奖平均 ${number(row.fragment5, 2)}/${number(row.fragment15, 2)}/${number(row.fragment30, 2)}（${row.episodes.toLocaleString("en-US")}局）`).join("；")}。`,
      `10. **不同深度与碎片状态如何决策？** 见上方玩家规则和 \`policy-definition.json\`；阈值以内重置，超过阈值继续。`,
      `11. **接近600时是否改变？** ${nearTargetPolicySentence(policy)}`,
      `12. **三模型结论是否一致？** ${sensitivity.map((summary) => `${summary.modelId}: 均值/P95/P99 ${number(summary.mean)}/${number(summary.p95, 0)}/${number(summary.p99, 0)}`).join("；")}。模型是敏感性假设，不能视为游戏内部事实。`,
      `13. **真实机制不是M1时最坏预期损失？** ${
        alternativeModelSensitivity.length > 0
          ? `在已覆盖的替代模型中，推荐策略相对其 M1 均值最差变化为 ${number(Math.max(...alternativeModelSensitivity.map((summary) => summary.mean - recommendation.mean)))} 次`
          : "本次未覆盖M2/M3，无法估计"
      }；这不覆盖三模型之外的未知机制。`,
      `14. **进取版与保守版权衡？** ${comparisonSentence(vsConservative)}${
        conservative
          ? ` 进取版与保守版的 P95 为 ${number(recommendation.p95, 0)} / ${number(conservative.p95, 0)}，P99 为 ${number(recommendation.p99, 0)} / ${number(conservative.p99, 0)}，P(>150) 为 ${percent(recommendation.probabilityGt150)} / ${percent(conservative.probabilityGt150)}，CVaR99 为 ${number(recommendation.cvar99)} / ${number(conservative.cvar99)}。`
          : ""
      }`,
      `15. **能否手工执行？** 可以：只需记录累计碎片、剩余重置、当前地图深度与已取得的5/15/30奖，并查策略阈值表；始终执行可完成性护栏。`,
    );
  } else {
    lines.push("由于没有合格候选策略，本节无法生成。");
  }

  lines.push(
    "",
    "## 完整统计表",
    "",
    markdownTable(
      [
        "模型",
        "策略",
        "样本",
        "均值",
        "均值95% CI",
        "P50",
        "P90",
        "P95",
        "P99",
        "CVaR95",
        "P(>150)",
        "失败率",
      ],
      summaryRows(input.summaries),
    ),
    "",
    "## 成对比较",
    "",
    input.comparisons.length > 0
      ? markdownTable(
          [
            "模型",
            "候选−基线",
            "平均差",
            "95% CI",
            "胜",
            "平",
            "负",
            "平均胜幅",
            "平均负幅",
          ],
          comparisonRows(input.comparisons),
        )
      : "本次运行未生成成对比较。",
    "",
    "差值定义为“候选成本−基线成本”，负值代表候选更省。所有成对策略对同一局编号使用相同底层地图种子。",
    "",
    "## 次优候选与统计可区分性",
    "",
  );

  if (recommendation && runnerUp) {
    const comparison = findComparison(
      input.comparisons,
      recommendation.strategyId,
      runnerUp.strategyId,
    );
    lines.push(
      `次优零失败候选为 ${runnerUp.strategyName}（均值 ${number(runnerUp.mean)}）。${comparisonSentence(comparison)} 若均值差的95%置信区间跨0，应表述为“无法区分”，而不是宣布胜出。`,
    );
  } else {
    lines.push("没有足够的第二候选用于比较。");
  }

  lines.push(
    "",
    "## 可复现配置",
    "",
    "```json",
    JSON.stringify(input.metadata, null, 2),
    "```",
    "",
    "训练、验证与正式测试必须使用互不重叠的主种子；本报告只将 `formal-test` 运行作为最终证据。",
    "",
    "## 假设与结论边界",
    "",
    "- M1、M2、M3 都是假设模型，公开资料不足以确定游戏内部抽取算法。",
    "- 除非完成了状态空间证明，否则参数搜索结果只能称为当前搜索空间内最优。",
    "- 操作2按零成本、最多13次处理；非碎片奖品价值未计入。",
    "- 置信区间只刻画蒙特卡洛抽样误差，不包含模型设定错误。",
    "",
    "## 数据文件索引",
    "",
    ...input.dataFiles.map((file) => `- \`${file}\``),
    "",
  );
  return lines.join("\n");
}
