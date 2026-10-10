import type { EChartsOption, SeriesOption } from "echarts";
import type {
  ExamPairedSeries,
  ExamResetConditionCell,
  ExamStrategySeries,
} from "../exam/types";

const TEXT = "#a8bac8";
const MUTED = "#657d8f";
const GRID = "rgba(137, 169, 190, 0.13)";
const BASELINE = "#e9a84b";
const SERIES_COLORS = [
  "#27d3c2",
  "#f4b860",
  "#8fa8ff",
  "#df7eaa",
  "#75c77d",
  "#62aee8",
];

const baseOption = {
  animationDuration: 240,
  animationDurationUpdate: 220,
  textStyle: {
    color: TEXT,
    fontFamily:
      '"Inter", "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  tooltip: {
    trigger: "axis" as const,
    confine: true,
    backgroundColor: "rgba(7, 20, 32, 0.96)",
    borderColor: "rgba(120, 170, 190, 0.28)",
    borderWidth: 1,
    textStyle: { color: "#e6f2f6", fontSize: 12 },
  },
  legend: {
    top: 0,
    type: "scroll" as const,
    itemWidth: 15,
    itemHeight: 7,
    textStyle: { color: TEXT, fontSize: 10 },
    pageTextStyle: { color: TEXT },
    pageIconColor: TEXT,
    pageIconInactiveColor: MUTED,
  },
  grid: {
    left: 58,
    right: 24,
    top: 48,
    bottom: 48,
  },
};

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export type ExamScoreMetric =
  | "mean"
  | "variance"
  | "pass"
  | "efficiency"
  | "marginal";

function scoreMetric(
  point: ExamStrategySeries["points"][number],
  metric: ExamScoreMetric,
): number | null {
  switch (metric) {
    case "mean":
      return point.meanFragments;
    case "variance":
      return point.varianceFragments;
    case "pass":
      return point.probabilityAtLeast600;
    case "efficiency":
      return point.fragmentsPerOperation;
    case "marginal":
      return point.marginalMeanFragments;
  }
}

const SCORE_LABELS: Record<ExamScoreMetric, string> = {
  mean: "平均碎片",
  variance: "碎片方差",
  pass: "达到600概率",
  efficiency: "碎片/操作",
  marginal: "边际碎片",
};

export function examScoreCurveOption(
  source: ExamStrategySeries[],
  metric: ExamScoreMetric,
): EChartsOption {
  const series: SeriesOption[] = source.flatMap((entry, index) => {
    const meanLine: SeriesOption = {
      name: entry.strategyName,
      type: "line",
      showSymbol: false,
      symbolSize: 5,
      smooth: false,
      lineStyle: { color: entry.color, width: index === 0 ? 2.4 : 1.7 },
      itemStyle: { color: entry.color },
      emphasis: { focus: "series" },
      data: entry.points.map((point) => [
        point.operations,
        scoreMetric(point, metric),
      ]),
      markLine:
        index === 0 && metric === "mean"
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { color: BASELINE, type: "dashed", width: 1.4 },
              label: {
                color: BASELINE,
                formatter: "600碎片",
                position: "insideEndTop",
              },
              data: [{ yAxis: 600 }],
            }
          : undefined,
    };
    if (metric !== "mean") return [meanLine];
    const stack = `score-band-${entry.key}`;
    return [
      {
        name: `__${entry.key}-p05`,
        type: "line",
        stack,
        silent: true,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        tooltip: { show: false },
        data: entry.points.map((point) => [
          point.operations,
          point.quantiles.p05,
        ]),
      },
      {
        name: `__${entry.key}-p05-p95`,
        type: "line",
        stack,
        silent: true,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: entry.color, opacity: 0.08 },
        tooltip: { show: false },
        data: entry.points.map((point) => [
          point.operations,
          point.quantiles.p95 - point.quantiles.p05,
        ]),
      },
      meanLine,
    ];
  });
  return {
    ...baseOption,
    legend: {
      ...baseOption.legend,
      data: source.map((entry) => entry.strategyName),
    },
    tooltip: {
      ...baseOption.tooltip,
      formatter: (params: unknown) => {
        const entries = Array.isArray(params) ? params : [];
        const visibleEntries = entries.filter(
          (raw) =>
            !(raw as { seriesName?: string }).seriesName?.startsWith("__"),
        );
        const first = visibleEntries[0] as { axisValue?: number } | undefined;
        const rows = visibleEntries
          .map((raw) => {
            const item = raw as {
              marker?: string;
              seriesName?: string;
              value?: [number, number];
            };
            const value = Number(item.value?.[1] ?? 0);
            const formatted =
              metric === "pass"
                ? percent(value, 2)
                : metric === "variance"
                  ? value.toFixed(2)
                  : value.toFixed(3);
            return `${item.marker ?? ""}${item.seriesName ?? ""}<b style="float:right;margin-left:18px">${formatted}</b>`;
          })
          .join("<br/>");
        return `<b>${first?.axisValue ?? "—"} 次操作</b><br/>${rows}`;
      },
    },
    xAxis: {
      type: "value",
      name: "操作 1 次数",
      min: 80,
      max: 180,
      interval: 10,
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: GRID } },
    },
    yAxis: {
      type: "value",
      name: SCORE_LABELS[metric],
      min: metric === "pass" ? 0 : undefined,
      max: metric === "pass" ? 1 : undefined,
      axisLabel: {
        color: MUTED,
        fontSize: 10,
        formatter:
          metric === "pass"
            ? (value: number) => percent(value, 0)
            : undefined,
      },
      splitLine: { lineStyle: { color: GRID } },
    },
    dataZoom: [
      { type: "inside", filterMode: "none" },
      {
        type: "slider",
        height: 12,
        bottom: 4,
        borderColor: "transparent",
        backgroundColor: "rgba(111, 145, 162, .08)",
        fillerColor: "rgba(39, 211, 194, .14)",
        handleStyle: { color: "#4c7d83", borderColor: "#79c5bf" },
        textStyle: { color: MUTED, fontSize: 9 },
      },
    ],
    series,
  };
}

export function examResetCurveOption(
  source: ExamStrategySeries[],
): EChartsOption {
  const series: SeriesOption[] = source.flatMap((entry) => [
    {
      name: `${entry.strategyName} · 平均`,
      type: "line",
      showSymbol: false,
      lineStyle: { color: entry.color, width: 2 },
      itemStyle: { color: entry.color },
      data: entry.points.map((point) => [
        point.operations,
        point.meanResets,
      ]),
    },
    {
      name: `${entry.strategyName} · P95`,
      type: "line",
      showSymbol: false,
      lineStyle: { color: entry.color, width: 1, type: "dashed", opacity: 0.7 },
      itemStyle: { color: entry.color },
      data: entry.points.map((point) => [
        point.operations,
        point.resetP95,
      ]),
    },
  ]);
  return {
    ...baseOption,
    xAxis: {
      type: "value",
      name: "操作 1 次数",
      min: 80,
      max: 180,
      interval: 10,
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: GRID } },
    },
    yAxis: {
      type: "value",
      name: "已用重置次数",
      min: 0,
      max: 13,
      interval: 1,
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: GRID } },
    },
    series,
  };
}

export function examConditionalHeatmapOption(
  cells: ExamResetConditionCell[],
  strategyName: string,
): EChartsOption {
  const operations = [...new Set(cells.map((cell) => cell.operations))].sort(
    (left, right) => left - right,
  );
  const resets = [...new Set(cells.map((cell) => cell.resetsUsed))].sort(
    (left, right) => left - right,
  );
  const operationIndex = new Map(
    operations.map((operation, index) => [operation, index]),
  );
  const resetIndex = new Map(resets.map((reset, index) => [reset, index]));
  const values = cells.map((cell) => [
    operationIndex.get(cell.operations) ?? 0,
    resetIndex.get(cell.resetsUsed) ?? 0,
    cell.meanFragments,
    cell.episodes,
    cell.probability,
    cell.varianceFragments,
  ]);
  const fragmentValues = cells.map((cell) => cell.meanFragments);
  return {
    ...baseOption,
    tooltip: {
      ...baseOption.tooltip,
      trigger: "item",
      formatter: (raw: unknown) => {
        const item = raw as {
          value?: [number, number, number, number, number, number];
        };
        const value = item.value;
        if (!value) return "";
        return [
          `<b>${strategyName}</b>`,
          `操作：${operations[value[0]] ?? "—"}`,
          `已用重置：${resets[value[1]] ?? "—"}`,
          `条件平均碎片：${Number(value[2]).toFixed(3)}`,
          `条件方差：${Number(value[5]).toFixed(2)}`,
          `样本：${Number(value[3]).toLocaleString("zh-CN")}`,
          `该重置层概率：${percent(Number(value[4]), 2)}`,
        ].join("<br/>");
      },
    },
    grid: { left: 52, right: 68, top: 28, bottom: 62 },
    legend: { show: false },
    xAxis: {
      type: "category",
      name: "操作 1 次数",
      data: operations.map(String),
      axisLabel: {
        color: MUTED,
        fontSize: 9,
        interval: Math.max(0, Math.floor(operations.length / 12) - 1),
      },
      splitArea: { show: true },
    },
    yAxis: {
      type: "category",
      name: "已用重置",
      data: resets.map(String),
      axisLabel: { color: MUTED, fontSize: 9 },
      splitArea: { show: true },
    },
    visualMap: {
      min: Math.min(...fragmentValues, 0),
      max: Math.max(...fragmentValues, 1),
      calculable: true,
      orient: "vertical",
      right: 4,
      top: "middle",
      textStyle: { color: MUTED, fontSize: 9 },
      inRange: { color: ["#122534", "#1d6d76", "#38c6b7", "#f0cf83"] },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      {
        type: "slider",
        xAxisIndex: 0,
        height: 12,
        bottom: 9,
        borderColor: "transparent",
        backgroundColor: "rgba(111, 145, 162, .08)",
        fillerColor: "rgba(39, 211, 194, .14)",
        textStyle: { color: MUTED, fontSize: 9 },
      },
    ],
    series: [
      {
        name: "条件平均碎片",
        type: "heatmap",
        data: values,
        emphasis: {
          itemStyle: {
            borderColor: "#d6f3ef",
            borderWidth: 1,
          },
        },
      },
    ],
  };
}

export function examPairedDifferenceOption(
  source: ExamPairedSeries[],
): EChartsOption {
  const labels = source.map(
    (entry) =>
      `${entry.candidateStrategyName} − ${entry.baselineStrategyName}`,
  );
  const series: SeriesOption[] = source.flatMap((entry, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length] ?? TEXT;
    const stack = `paired-band-${entry.key}`;
    return [
      {
        name: `__${entry.key}-ci-low`,
        type: "line",
        stack,
        silent: true,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        tooltip: { show: false },
        data: entry.points.map((point) => [
          point.operations,
          point.ci95Low,
        ]),
      },
      {
        name: `__${entry.key}-ci-width`,
        type: "line",
        stack,
        silent: true,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 0.1 },
        tooltip: { show: false },
        data: entry.points.map((point) => [
          point.operations,
          point.ci95High - point.ci95Low,
        ]),
      },
      {
        name: labels[index],
        type: "line",
        showSymbol: false,
        lineStyle: {
          color,
          width: index === 0 ? 2.3 : 1.5,
        },
        itemStyle: { color },
        data: entry.points.map((point) => [
          point.operations,
          point.meanFragmentDifference,
        ]),
        markLine:
          index === 0
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: MUTED, type: "dashed" },
                label: { show: false },
                data: [{ yAxis: 0 }],
              }
            : undefined,
      },
    ];
  });
  return {
    ...baseOption,
    legend: {
      ...baseOption.legend,
      data: labels,
    },
    tooltip: {
      ...baseOption.tooltip,
      formatter: (params: unknown) => {
        const entries = Array.isArray(params)
          ? params.filter(
              (raw) =>
                !(raw as { seriesName?: string }).seriesName?.startsWith("__"),
            )
          : [];
        const first = entries[0] as { axisValue?: number } | undefined;
        const rows = entries
          .map((raw) => {
            const item = raw as {
              marker?: string;
              seriesName?: string;
              value?: [number, number];
            };
            return `${item.marker ?? ""}${item.seriesName ?? ""}<b style="float:right;margin-left:18px">${Number(item.value?.[1] ?? 0).toFixed(3)}</b>`;
          })
          .join("<br/>");
        return `<b>${first?.axisValue ?? "—"} 次操作</b><br/>${rows}`;
      },
    },
    xAxis: {
      type: "value",
      name: "操作 1 次数",
      min: 80,
      max: 180,
      interval: 10,
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: GRID } },
    },
    yAxis: {
      type: "value",
      name: "相对基线平均碎片差",
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: GRID } },
    },
    series,
  };
}
