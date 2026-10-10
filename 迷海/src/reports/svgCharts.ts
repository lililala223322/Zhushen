import type {
  ConvergencePoint,
  CostHistogramBin,
  HistogramBin,
  SummaryMetrics,
} from "./types";

export interface HistogramSeries {
  label: string;
  color: string;
  bins: readonly CostHistogramBin[] | readonly HistogramBin[];
}

const WIDTH = 960;
const HEIGHT = 520;
const MARGIN = { left: 72, right: 28, top: 58, bottom: 62 };

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgFrame(title: string, content: string, legend = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title)}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${MARGIN.left}" y="30" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#172033">${escapeXml(title)}</text>
${content}
${legend}
</svg>
`;
}

function axes(
  xMin: number,
  xMax: number,
  yMax: number,
  xLabel: string,
  yLabel: string,
  yMin = 0,
): string {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const lines: string[] = [
    `<line x1="${MARGIN.left}" y1="${MARGIN.top + plotHeight}" x2="${MARGIN.left + plotWidth}" y2="${MARGIN.top + plotHeight}" stroke="#667085"/>`,
    `<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + plotHeight}" stroke="#667085"/>`,
  ];
  for (let index = 0; index <= 5; index += 1) {
    const fraction = index / 5;
    const x = MARGIN.left + fraction * plotWidth;
    const value = xMin + fraction * (xMax - xMin);
    lines.push(
      `<line x1="${x}" y1="${MARGIN.top + plotHeight}" x2="${x}" y2="${MARGIN.top + plotHeight + 5}" stroke="#667085"/>`,
      `<text x="${x}" y="${MARGIN.top + plotHeight + 22}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#475467">${Math.round(value)}</text>`,
    );
    const y = MARGIN.top + plotHeight - fraction * plotHeight;
    lines.push(
      `<line x1="${MARGIN.left}" y1="${y}" x2="${MARGIN.left + plotWidth}" y2="${y}" stroke="#eef1f5"/>`,
      `<text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#475467">${Math.round(yMin + fraction * (yMax - yMin)).toLocaleString("en-US")}</text>`,
    );
  }
  lines.push(
    `<text x="${MARGIN.left + plotWidth / 2}" y="${HEIGHT - 14}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#344054">${escapeXml(xLabel)}</text>`,
    `<text x="18" y="${MARGIN.top + plotHeight / 2}" transform="rotate(-90 18 ${MARGIN.top + plotHeight / 2})" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#344054">${escapeXml(yLabel)}</text>`,
  );
  return lines.join("\n");
}

function legend(series: readonly { label: string; color: string }[]): string {
  return series
    .map((item, index) => {
      const x = MARGIN.left + index * 180;
      return `<line x1="${x}" y1="48" x2="${x + 20}" y2="48" stroke="${item.color}" stroke-width="3"/>
<text x="${x + 26}" y="52" font-family="system-ui,sans-serif" font-size="12" fill="#344054">${escapeXml(item.label)}</text>`;
    })
    .join("\n");
}

export function buildCostDistributionSvg(
  modelLabel: string,
  series: readonly HistogramSeries[],
): string {
  const allBins = series.flatMap((item) => [...item.bins]);
  if (allBins.length === 0) return svgFrame(`${modelLabel} 成本分布`, "");
  const xMin = Math.min(...allBins.map((bin) => bin.value));
  const xMax = Math.max(...allBins.map((bin) => bin.value), xMin + 1);
  const yMax = Math.max(...allBins.map((bin) => bin.count), 1);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xScale = (value: number) =>
    MARGIN.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yScale = (value: number) =>
    MARGIN.top + plotHeight - (value / yMax) * plotHeight;
  const paths = series
    .map((item) => {
      const binMap = new Map(item.bins.map((bin) => [bin.value, bin.count]));
      const points: string[] = [];
      for (let value = xMin; value <= xMax; value += 1) {
        points.push(`${xScale(value)},${yScale(binMap.get(value) ?? 0)}`);
      }
      return `<polyline points="${points.join(" ")}" fill="none" stroke="${item.color}" stroke-width="2" stroke-linejoin="round" opacity="0.9"/>`;
    })
    .join("\n");
  const baselineX = xScale(150);
  const baseline =
    baselineX >= MARGIN.left && baselineX <= WIDTH - MARGIN.right
      ? `<line x1="${baselineX}" y1="${MARGIN.top}" x2="${baselineX}" y2="${MARGIN.top + plotHeight}" stroke="#d92d20" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="${baselineX + 5}" y="${MARGIN.top + 14}" font-family="system-ui,sans-serif" font-size="11" fill="#d92d20">150基线</text>`
      : "";
  return svgFrame(
    `${modelLabel} 成本分布`,
    `${axes(xMin, xMax, yMax, "操作1成本", "模拟落入次数")}\n${paths}\n${baseline}`,
    legend(series),
  );
}

export function buildCostCdfSvg(
  modelLabel: string,
  series: readonly HistogramSeries[],
): string {
  const allBins = series.flatMap((item) => [...item.bins]);
  if (allBins.length === 0) {
    return svgFrame(`${modelLabel} 成本累计分布`, "");
  }
  const xMin = Math.min(...allBins.map((bin) => bin.value));
  const xMax = Math.max(...allBins.map((bin) => bin.value), xMin + 1);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xScale = (value: number) =>
    MARGIN.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yScale = (probability: number) =>
    MARGIN.top + plotHeight - probability * plotHeight;
  const marks: string[] = [
    `<line x1="${MARGIN.left}" y1="${MARGIN.top + plotHeight}" x2="${MARGIN.left + plotWidth}" y2="${MARGIN.top + plotHeight}" stroke="#667085"/>`,
    `<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + plotHeight}" stroke="#667085"/>`,
  ];
  for (let index = 0; index <= 5; index += 1) {
    const fraction = index / 5;
    const x = MARGIN.left + fraction * plotWidth;
    const xValue = xMin + fraction * (xMax - xMin);
    marks.push(
      `<line x1="${x}" y1="${MARGIN.top + plotHeight}" x2="${x}" y2="${MARGIN.top + plotHeight + 5}" stroke="#667085"/>`,
      `<text x="${x}" y="${MARGIN.top + plotHeight + 22}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#475467">${Math.round(xValue)}</text>`,
    );
    const y = yScale(fraction);
    marks.push(
      `<line x1="${MARGIN.left}" y1="${y}" x2="${MARGIN.left + plotWidth}" y2="${y}" stroke="#eef1f5"/>`,
      `<text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#475467">${Math.round(fraction * 100)}%</text>`,
    );
  }
  marks.push(
    `<text x="${MARGIN.left + plotWidth / 2}" y="${HEIGHT - 14}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#344054">完成600碎片所需操作1成本</text>`,
    `<text x="18" y="${MARGIN.top + plotHeight / 2}" transform="rotate(-90 18 ${MARGIN.top + plotHeight / 2})" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#344054">累计概率 P(成本≤x)</text>`,
  );

  const paths = series
    .map((item) => {
      const binMap = new Map(item.bins.map((bin) => [bin.value, bin.count]));
      const total = item.bins.reduce((sum, bin) => sum + bin.count, 0);
      let cumulative = 0;
      const points: string[] = [];
      for (let value = xMin; value <= xMax; value += 1) {
        cumulative += binMap.get(value) ?? 0;
        points.push(
          `${xScale(value)},${yScale(total > 0 ? cumulative / total : 0)}`,
        );
      }
      return `<polyline points="${points.join(" ")}" fill="none" stroke="${item.color}" stroke-width="2.5" stroke-linejoin="round" opacity="0.95"/>`;
    })
    .join("\n");

  const referenceLines = [
    { value: 120, label: "120目标", color: "#f79009" },
    { value: 150, label: "150基线", color: "#d92d20" },
  ]
    .filter(({ value }) => value >= xMin && value <= xMax)
    .map(({ value, label, color }, index) => {
      const x = xScale(value);
      return `<line x1="${x}" y1="${MARGIN.top}" x2="${x}" y2="${MARGIN.top + plotHeight}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="${x + 5}" y="${MARGIN.top + 14 + index * 15}" font-family="system-ui,sans-serif" font-size="11" fill="${color}">${label}</text>`;
    })
    .join("\n");

  return svgFrame(
    `${modelLabel} 成本累计分布`,
    `${marks.join("\n")}\n${paths}\n${referenceLines}`,
    legend(series),
  );
}

export function buildConvergenceSvg(
  modelLabel: string,
  points: readonly ConvergencePoint[],
  colors: Readonly<Record<string, string>>,
): string {
  if (points.length === 0) return svgFrame(`${modelLabel} 均值收敛`, "");
  const maxEpisodes = Math.max(...points.map((point) => point.episodes), 1);
  const minMean = Math.min(...points.map((point) => point.ci95Low));
  const maxMean = Math.max(...points.map((point) => point.ci95High));
  const paddedMin = minMean - Math.max(0.5, (maxMean - minMean) * 0.1);
  const paddedMax = maxMean + Math.max(0.5, (maxMean - minMean) * 0.1);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xScale = (value: number) =>
    MARGIN.left + (value / maxEpisodes) * plotWidth;
  const yScale = (value: number) =>
    MARGIN.top +
    plotHeight -
    ((value - paddedMin) / (paddedMax - paddedMin)) * plotHeight;
  const byStrategy = new Map<string, ConvergencePoint[]>();
  for (const point of points) {
    const values = byStrategy.get(point.strategyId) ?? [];
    values.push(point);
    byStrategy.set(point.strategyId, values);
  }
  const paths = [...byStrategy.entries()]
    .map(([strategyId, values]) => {
      values.sort((left, right) => left.episodes - right.episodes);
      const pointsText = values
        .map((point) => `${xScale(point.episodes)},${yScale(point.mean)}`)
        .join(" ");
      return `<polyline points="${pointsText}" fill="none" stroke="${colors[strategyId] ?? "#344054"}" stroke-width="2"/>`;
    })
    .join("\n");
  return svgFrame(
    `${modelLabel} 均值收敛`,
    `${axes(0, maxEpisodes, paddedMax, "累计模拟局数", "累计均值", paddedMin)}\n${paths}`,
    legend(
      [...byStrategy.keys()].map((strategyId) => ({
        label: strategyId,
        color: colors[strategyId] ?? "#344054",
      })),
    ),
  );
}

export function buildModelSensitivitySvg(
  strategyLabel: string,
  summaries: readonly SummaryMetrics[],
): string {
  const relevant = summaries
    .filter((summary) => summary.strategyId === strategyLabel)
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
  if (relevant.length === 0) return svgFrame("模型敏感性", "");
  const values = relevant.flatMap((summary) => [
    summary.mean,
    summary.p95,
    summary.p99,
  ]);
  const yMin = Math.floor(Math.min(...values) - 5);
  const yMax = Math.ceil(Math.max(...values) + 5);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const yScale = (value: number) =>
    MARGIN.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;
  const colors = ["#175cd3", "#f79009", "#d92d20"];
  const labels = ["均值", "P95", "P99"];
  const marks: string[] = [];
  relevant.forEach((summary, modelIndex) => {
    const groupWidth = plotWidth / relevant.length;
    const center = MARGIN.left + groupWidth * (modelIndex + 0.5);
    [summary.mean, summary.p95, summary.p99].forEach((value, metricIndex) => {
      const x = center + (metricIndex - 1) * 34;
      marks.push(
        `<circle cx="${x}" cy="${yScale(value)}" r="6" fill="${colors[metricIndex]}"/>`,
        `<text x="${x}" y="${yScale(value) - 10}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#344054">${value.toFixed(metricIndex === 0 ? 2 : 0)}</text>`,
      );
    });
    marks.push(
      `<text x="${center}" y="${MARGIN.top + plotHeight + 24}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#344054">${summary.modelId}</text>`,
    );
  });
  return svgFrame(
    `${strategyLabel} 模型敏感性`,
    `${axes(0, relevant.length, yMax, "假设模型", "操作1成本", yMin)}\n${marks.join("\n")}`,
    legend(labels.map((label, index) => ({ label, color: colors[index] ?? "#344054" }))),
  );
}
