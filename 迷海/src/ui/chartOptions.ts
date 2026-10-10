import type { EChartsOption, SeriesOption } from "echarts";
import type {
  BaselineBenefit,
  ConvergenceSeries,
  CostHistogramSeries,
  CostResetHeatmap,
  DistributionSeries,
  FragmentAcquisitionSeries,
  IntegerHistogramSeries,
  PairedComparison,
  PolicyDecisionHeatmap,
  ResetHistogramSeries,
  SensitivityMetric,
} from "./workerTypes";

const TEXT = "#a8bac8";
const MUTED = "#657d8f";
const GRID = "rgba(137, 169, 190, 0.13)";
const BASELINE = "#e9a84b";
const COLORS = ["#27d3c2", "#8fa8ff", "#f4b860", "#8b96a8", "#e381a9", "#74b8ff"];

const baseOption = {
  animationDuration: 280,
  animationDurationUpdate: 260,
  textStyle: {
    color: TEXT,
    fontFamily:
      '"Inter", "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  aria: {
    enabled: true,
    decal: { show: true },
  },
  tooltip: {
    trigger: "axis" as const,
    confine: true,
    backgroundColor: "rgba(7, 20, 32, 0.96)",
    borderColor: "rgba(120, 170, 190, 0.28)",
    borderWidth: 1,
    textStyle: { color: "#e6f2f6", fontSize: 12 },
    extraCssText: "box-shadow: 0 12px 35px rgba(0,0,0,.35); border-radius: 8px;",
  },
  legend: {
    top: 0,
    left: 0,
    itemWidth: 15,
    itemHeight: 7,
    textStyle: { color: TEXT, fontSize: 11 },
    pageTextStyle: { color: TEXT },
    pageIconColor: TEXT,
    pageIconInactiveColor: MUTED,
  },
  grid: {
    left: 48,
    right: 22,
    top: 46,
    bottom: 46,
    containLabel: false,
  },
};

function categoryAxis(name: string) {
  return {
    type: "category" as const,
    name,
    nameLocation: "middle" as const,
    nameGap: 30,
    nameTextStyle: { color: MUTED, fontSize: 11 },
    axisLine: { lineStyle: { color: GRID } },
    axisTick: { show: false },
    axisLabel: { color: MUTED, fontSize: 10 },
  };
}

function valueAxis(name: string) {
  return {
    type: "value" as const,
    name,
    nameTextStyle: { color: MUTED, fontSize: 11, align: "right" as const },
    splitLine: { lineStyle: { color: GRID } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: MUTED, fontSize: 10 },
  };
}

function compactNumber(value: number) {
  return Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function cumulativeProbabilitiesAtCosts(
  bins: CostHistogramSeries["bins"],
  costs: number[],
): number[] {
  const probabilityByCost = new Map(
    bins.map((bin) => [bin.value, bin.probability]),
  );
  let cumulative = 0;
  return costs.map((cost) => {
    cumulative += probabilityByCost.get(cost) ?? 0;
    return Math.min(1, Math.max(0, cumulative));
  });
}

export function costHistogramOption(
  source: CostHistogramSeries[],
  mode: "count" | "probability",
): EChartsOption {
  const observedCosts = Array.from(
    new Set(source.flatMap((series) => series.bins.map((bin) => bin.value))),
  ).sort((a, b) => a - b);
  const minimumCost = observedCosts[0];
  const maximumCost = observedCosts.at(-1);
  const categories =
    minimumCost === undefined || maximumCost === undefined
      ? []
      : Array.from(
          { length: maximumCost - minimumCost + 1 },
          (_, index) => minimumCost + index,
        );
  const series: SeriesOption[] = source.map((item, index) => {
    const lookup = new Map(item.bins.map((bin) => [bin.value, bin]));
    const color = item.color ?? COLORS[index % COLORS.length];
    const data =
      mode === "count"
        ? categories.map((cost) => lookup.get(cost)?.count ?? 0)
        : cumulativeProbabilitiesAtCosts(item.bins, categories);
    const markLine =
      index === 0
        ? {
            silent: true,
            symbol: "none" as const,
            lineStyle: { color: BASELINE, type: "dashed" as const, width: 1.5 },
            label: {
              show: true,
              formatter: "全开基线 150",
              color: BASELINE,
              fontSize: 10,
              position: "insideEndTop" as const,
            },
            data: [{ xAxis: "150" }],
          }
        : undefined;
    if (mode === "probability") {
      return {
        name: item.strategyName,
        type: "line",
        step: "end",
        showSymbol: false,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: { color, opacity: source.length > 1 ? 0.035 : 0.08 },
        emphasis: { focus: "series", showSymbol: true },
        data,
        markLine,
      };
    }
    return {
      name: item.strategyName,
      type: "bar",
      barGap: source.length > 1 ? "-72%" : "0%",
      barCategoryGap: "18%",
      itemStyle: {
        color,
        opacity: source.length > 1 ? 0.55 + Math.max(0, 0.24 - index * 0.05) : 0.9,
        borderRadius: [2, 2, 0, 0],
      },
      emphasis: { focus: "series", itemStyle: { opacity: 1 } },
      data,
      markLine,
    };
  });
  return {
    ...baseOption,
    tooltip: {
      ...baseOption.tooltip,
      formatter: (params: unknown) => {
        const values = Array.isArray(params) ? params : [];
        const first = values[0] as { axisValueLabel?: string } | undefined;
        const rows = values
          .map((entry) => {
            const item = entry as {
              marker?: string;
              seriesName?: string;
              value?: number;
            };
            const value =
              mode === "count"
                ? compactNumber(Number(item.value ?? 0))
                : `${(Number(item.value ?? 0) * 100).toFixed(3)}%`;
            return `${item.marker ?? ""}${item.seriesName ?? ""}<b style="float:right;margin-left:18px">${value}</b>`;
          })
          .join("<br/>");
        const heading =
          mode === "count"
            ? `操作 1 成本：${first?.axisValueLabel ?? "—"}`
            : `累计至成本：${first?.axisValueLabel ?? "—"}（P(成本 ≤ x)）`;
        return `<b>${heading}</b><br/>${rows}`;
      },
    },
    xAxis: {
      ...categoryAxis("操作 1 次数"),
      data: categories.map(String),
      axisLabel: {
        color: MUTED,
        fontSize: 10,
        interval: Math.max(0, Math.floor(categories.length / 12) - 1),
      },
    },
    yAxis: {
      ...valueAxis(mode === "count" ? "恰好落入局数" : "累计概率 P(成本≤x)"),
      min: 0,
      max: mode === "probability" ? 1 : undefined,
      axisLabel: {
        color: MUTED,
        fontSize: 10,
        formatter: mode === "count" ? compactNumber : (value: number) => `${(value * 100).toFixed(1)}%`,
      },
    },
    dataZoom: [
      { type: "inside", filterMode: "none" },
      {
        type: "slider",
        height: 12,
        bottom: 5,
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

export function distributionOption(
  source: DistributionSeries[],
  mode: "cdf" | "tail",
): EChartsOption {
  const series: SeriesOption[] = source.map((item, index) => ({
    name: item.strategyName,
    type: "line",
    showSymbol: false,
    smooth: 0.16,
    connectNulls: true,
    lineStyle: {
      width: index === 0 ? 2.4 : 1.7,
      color: item.color ?? COLORS[index % COLORS.length],
    },
    itemStyle: { color: item.color ?? COLORS[index % COLORS.length] },
    data: (mode === "cdf" ? item.cdf : item.survival)
      .filter((point) => mode === "cdf" || point.probability > 0)
      .map((point) => [point.cost, point.probability]),
    markLine:
      index === 0
        ? {
            silent: true,
            symbol: "none",
            lineStyle: { color: BASELINE, type: "dashed", width: 1.2 },
            label: { color: BASELINE, formatter: "150", fontSize: 10 },
            data: [{ xAxis: 150 }],
          }
        : undefined,
  }));
  return {
    ...baseOption,
    grid: { ...baseOption.grid, left: 54 },
    tooltip: {
      ...baseOption.tooltip,
      valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(3)}%`,
    },
    xAxis: {
      ...valueAxis("操作 1 次数"),
      nameLocation: "middle",
      nameGap: 30,
      min: "dataMin",
      max: "dataMax",
    },
    yAxis: {
      ...valueAxis(mode === "cdf" ? "累计概率" : "超出概率"),
      type: mode === "tail" ? "log" : "value",
      min: mode === "tail" ? 0.0001 : 0,
      max: 1,
      logBase: 10,
      axisLabel: {
        color: MUTED,
        fontSize: 10,
        formatter: (value: number) =>
          value >= 0.01 ? `${(value * 100).toFixed(0)}%` : value.toExponential(0),
      },
    },
    series,
  };
}

export function convergenceOption(
  source: ConvergenceSeries[],
  mode: "mean" | "quantiles",
): EChartsOption {
  const series: SeriesOption[] = [];
  if (mode === "mean") {
    source.forEach((item, index) => {
      const color = item.color ?? COLORS[index % COLORS.length];
      series.push({
        name: item.strategyName,
        type: "line",
        showSymbol: false,
        data: item.points.map((point) => [point.episodes, point.mean]),
        lineStyle: { color, width: index === 0 ? 2.3 : 1.7 },
        itemStyle: { color },
      });
      if (index === 0) {
        series.push(
          {
            name: "95% CI 上界",
            type: "line",
            showSymbol: false,
            data: item.points.map((point) => [point.episodes, point.ci95High]),
            lineStyle: { color, type: "dotted", width: 1, opacity: 0.7 },
            itemStyle: { color },
          },
          {
            name: "95% CI 下界",
            type: "line",
            showSymbol: false,
            data: item.points.map((point) => [point.episodes, point.ci95Low]),
            lineStyle: { color, type: "dotted", width: 1, opacity: 0.7 },
            itemStyle: { color },
          },
        );
      }
    });
  } else {
    const primary = source[0];
    if (primary) {
      (["p50", "p90", "p95", "p99"] as const).forEach((key, index) => {
        series.push({
          name: key.toUpperCase(),
          type: "line",
          showSymbol: false,
          data: primary.points.map((point) => [point.episodes, point[key]]),
          lineStyle: {
            color: COLORS[index % COLORS.length],
            width: index === 0 ? 2.3 : 1.6,
          },
          itemStyle: { color: COLORS[index % COLORS.length] },
        });
      });
    }
  }
  return {
    ...baseOption,
    tooltip: {
      ...baseOption.tooltip,
      valueFormatter: (value: unknown) => Number(value).toFixed(3),
    },
    xAxis: {
      ...valueAxis("累计模拟局数"),
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: MUTED, fontSize: 10, formatter: compactNumber },
    },
    yAxis: {
      ...valueAxis(mode === "mean" ? "均值 / 95% CI" : "关键分位数"),
      scale: true,
      axisLabel: { color: MUTED, fontSize: 10, formatter: (value: number) => value.toFixed(1) },
    },
    series,
  };
}

export function resetHistogramOption(source: ResetHistogramSeries[]): EChartsOption {
  const categories = Array.from({ length: 14 }, (_, index) => index);
  return {
    ...baseOption,
    tooltip: {
      ...baseOption.tooltip,
      valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(2)}%`,
    },
    xAxis: { ...categoryAxis("重置次数"), data: categories },
    yAxis: {
      ...valueAxis("局数占比"),
      axisLabel: { color: MUTED, fontSize: 10, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
    },
    series: source.map((item, index) => ({
      name: item.strategyName,
      type: "bar",
      data: categories.map(
        (value) => item.bins.find((bin) => bin.value === value)?.probability ?? 0,
      ),
      itemStyle: {
        color: item.color ?? COLORS[index % COLORS.length],
        opacity: 0.82,
        borderRadius: [3, 3, 0, 0],
      },
    })),
  };
}

export function pairedDifferenceOption(source?: PairedComparison): EChartsOption {
  const histogram = source?.histogram ?? [];
  return {
    ...baseOption,
    legend: { show: false },
    tooltip: {
      ...baseOption.tooltip,
      valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(2)}%`,
    },
    xAxis: {
      ...categoryAxis("进取成本 − 全开成本"),
      data: histogram.map((bin) => String(bin.difference)),
      axisLabel: { color: MUTED, fontSize: 10, interval: 4 },
    },
    yAxis: {
      ...valueAxis("成对样本占比"),
      axisLabel: { color: MUTED, fontSize: 10, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
    },
    series: [
      {
        name: source?.candidateStrategyName ?? "策略差值",
        type: "bar",
        data: histogram.map((bin) => ({
          value: bin.probability,
          itemStyle: {
            color: bin.difference < 0 ? "#27d3c2" : bin.difference > 0 ? "#e87b7b" : "#8fa8ff",
            opacity: 0.86,
          },
        })),
        markLine: {
          symbol: "none",
          lineStyle: { color: "#93a4b1", width: 1 },
          label: { formatter: "持平", color: TEXT, fontSize: 10 },
          data: [{ xAxis: "0" }],
        },
      },
    ],
  };
}

export function sensitivityOption(source: SensitivityMetric[]): EChartsOption {
  const categories = source.map((item) => `${item.modelId}\n${item.strategyName}`);
  return {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, valueFormatter: (value: unknown) => Number(value).toFixed(2) },
    xAxis: {
      ...categoryAxis("假设模型 × 策略"),
      data: categories,
      axisLabel: { color: MUTED, fontSize: 9, interval: 0 },
    },
    yAxis: { ...valueAxis("操作 1 次数"), min: "dataMin", max: "dataMax" },
    series: [
      {
        name: "均值",
        type: "bar",
        data: source.map((item) => item.mean),
        itemStyle: { color: COLORS[0], borderRadius: [3, 3, 0, 0] },
      },
      {
        name: "P95",
        type: "bar",
        data: source.map((item) => item.p95),
        itemStyle: { color: COLORS[1], borderRadius: [3, 3, 0, 0] },
      },
      {
        name: "P99",
        type: "bar",
        data: source.map((item) => item.p99),
        itemStyle: { color: COLORS[2], borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
}

export function integerHistogramOption(
  source: IntegerHistogramSeries[],
  metric: "map-count" | "fragment-overflow",
): EChartsOption {
  const filtered = source.filter((item) => item.metric === metric);
  const categories = Array.from(
    new Set(filtered.flatMap((item) => item.bins.map((bin) => bin.value))),
  ).sort((a, b) => a - b);
  const isMaps = metric === "map-count";
  return {
    ...baseOption,
    xAxis: {
      ...categoryAxis(isMaps ? "进入地图数" : "最终碎片 − 目标"),
      data: categories,
    },
    yAxis: {
      ...valueAxis("局数占比"),
      axisLabel: { color: MUTED, fontSize: 10, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
    },
    tooltip: {
      ...baseOption.tooltip,
      valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(2)}%`,
    },
    series: filtered.map((item, index) => ({
      name: item.strategyName,
      type: "line",
      smooth: 0.2,
      symbolSize: 5,
      areaStyle: { color: item.color ?? COLORS[index % COLORS.length], opacity: 0.08 },
      lineStyle: { color: item.color ?? COLORS[index % COLORS.length], width: 2 },
      itemStyle: { color: item.color ?? COLORS[index % COLORS.length] },
      data: categories.map(
        (value) => item.bins.find((bin) => bin.value === value)?.probability ?? 0,
      ),
    })),
  };
}

export function fragmentAcquisitionOption(source: FragmentAcquisitionSeries[]): EChartsOption {
  const categories = Array.from(
    new Set(source.flatMap((item) => item.points.map((point) => point.acquisitionCount))),
  ).sort((a, b) => a - b);
  return {
    ...baseOption,
    xAxis: { ...categoryAxis("单局取得次数"), data: categories },
    yAxis: {
      ...valueAxis("局数占比"),
      axisLabel: { color: MUTED, fontSize: 10, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
    },
    tooltip: {
      ...baseOption.tooltip,
      valueFormatter: (value: unknown) => `${(Number(value) * 100).toFixed(2)}%`,
    },
    series: source.map((item, index) => ({
      name: `${item.fragmentValue} 碎片`,
      type: "line",
      showSymbol: true,
      symbolSize: 4,
      smooth: 0.2,
      lineStyle: { color: COLORS[index % 3], width: 2 },
      itemStyle: { color: COLORS[index % 3] },
      data: categories.map(
        (value) =>
          item.points.find((point) => point.acquisitionCount === value)?.probability ?? 0,
      ),
    })),
  };
}

export function costResetHeatmapOption(source?: CostResetHeatmap): EChartsOption {
  const maximum = Math.max(1, ...(source?.cells.map((cell) => cell.value) ?? [1]));
  return {
    ...baseOption,
    grid: { ...baseOption.grid, top: 24, right: 70 },
    legend: { show: false },
    tooltip: {
      ...baseOption.tooltip,
      position: "top",
      formatter: (params: unknown) => {
        const value = (params as { value?: [number, number, number] }).value;
        if (!value || !source) return "—";
        return `成本 ${source.costs[value[0]] ?? "—"}<br/>重置 ${source.resetCounts[value[1]] ?? "—"} 次<br/>局数 ${compactNumber(value[2])}`;
      },
    },
    xAxis: {
      ...categoryAxis("操作 1 次数"),
      data: source?.costs ?? [],
      splitArea: { show: true, areaStyle: { color: ["rgba(255,255,255,.01)", "rgba(255,255,255,.025)"] } },
    },
    yAxis: {
      ...categoryAxis("重置次数"),
      data: source?.resetCounts ?? [],
      splitArea: { show: true, areaStyle: { color: ["rgba(255,255,255,.01)", "rgba(255,255,255,.025)"] } },
    },
    visualMap: {
      min: 0,
      max: maximum,
      calculable: true,
      orient: "vertical",
      right: 0,
      top: "center",
      textStyle: { color: MUTED, fontSize: 9 },
      inRange: { color: ["#0b2431", "#17635f", "#27d3c2", "#e8d17d"] },
    },
    series: [
      {
        name: "局数",
        type: "heatmap",
        data: source?.cells.map((cell) => [cell.x, cell.y, Math.round(cell.value)]) ?? [],
        emphasis: { itemStyle: { borderColor: "#fff", borderWidth: 1 } },
      },
    ],
  };
}

export function policyHeatmapOption(source?: PolicyDecisionHeatmap): EChartsOption {
  return {
    ...baseOption,
    grid: { ...baseOption.grid, top: 24, left: 112, right: 72 },
    legend: { show: false },
    tooltip: {
      ...baseOption.tooltip,
      formatter: (params: unknown) => {
        const value = (params as { value?: [number, number, number] }).value;
        if (!value || !source) return "—";
        return `${source.fragmentStates[value[1]] ?? "—"}<br/>第 ${source.depths[value[0]] ?? "—"} 格<br/><b>${value[2] >= 0.5 ? "重置" : "继续"}</b>`;
      },
    },
    xAxis: {
      ...categoryAxis("地图深度"),
      data: source?.depths ?? [],
      axisLabel: { color: MUTED, fontSize: 9, interval: 1 },
    },
    yAxis: {
      ...categoryAxis("已取得额外碎片"),
      data: source?.fragmentStates ?? [],
      axisLabel: { color: TEXT, fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: false,
      orient: "vertical",
      right: 0,
      top: "center",
      text: ["重置", "继续"],
      textStyle: { color: MUTED, fontSize: 9 },
      inRange: { color: ["#173348", "#217083", "#e9a84b"] },
    },
    series: [
      {
        name: "决策",
        type: "heatmap",
        data:
          source?.cells.map((cell) => [
            cell.depth - 1,
            cell.fragmentStateIndex,
            cell.resetProbability,
          ]) ?? [],
      },
    ],
  };
}

export function baselineBenefitOption(source: BaselineBenefit[]): EChartsOption {
  const categories = source.map((item) => `${item.modelId}\n${item.strategyName}`);
  return {
    ...baseOption,
    tooltip: { ...baseOption.tooltip },
    xAxis: { ...categoryAxis("模型 × 策略"), data: categories, axisLabel: { color: MUTED, fontSize: 9, interval: 0 } },
    yAxis: [
      {
        ...valueAxis("平均节省次数"),
        min: 0,
      },
      {
        ...valueAxis("胜 / 平 / 负"),
        min: 0,
        max: 1,
        axisLabel: { color: MUTED, fontSize: 10, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
      },
    ],
    series: [
      {
        name: "平均节省",
        type: "bar",
        yAxisIndex: 0,
        data: source.map((item) => item.meanSavings),
        itemStyle: { color: COLORS[0], borderRadius: [3, 3, 0, 0] },
      },
      {
        name: "胜率",
        type: "line",
        yAxisIndex: 1,
        data: source.map((item) => item.winRate),
        lineStyle: { color: "#82d28f", width: 2 },
        itemStyle: { color: "#82d28f" },
      },
      {
        name: "负率",
        type: "line",
        yAxisIndex: 1,
        data: source.map((item) => item.lossRate),
        lineStyle: { color: "#e87b7b", width: 2 },
        itemStyle: { color: "#e87b7b" },
      },
    ],
  };
}
