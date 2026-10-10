import type { EChartsType } from "echarts/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  baselineBenefitOption,
  convergenceOption,
  costHistogramOption,
  costResetHeatmapOption,
  distributionOption,
  fragmentAcquisitionOption,
  integerHistogramOption,
  pairedDifferenceOption,
  policyHeatmapOption,
  resetHistogramOption,
  sensitivityOption,
} from "./ui/chartOptions";
import {
  DEFAULT_CONFIG,
  MODEL_OPTIONS,
} from "./ui/demoData";
import {
  STRATEGY_DEFINITIONS,
  STRATEGY_GROUPS,
  STRATEGY_OPTIONS,
} from "./ui/strategyCatalog";
import { EChart } from "./ui/EChart";
import { ExamPanel } from "./ui/ExamPanel";
import {
  AlertIcon,
  ChartIcon,
  CompassIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  StopIcon,
} from "./ui/Icons";
import { useSimulationDashboard } from "./ui/useSimulationDashboard";
import type {
  ModelId,
  RunPhase,
  SimulationConfig,
  SimulationPort,
  StrategyDefinition,
  SummaryStats,
} from "./ui/workerTypes";
import "./styles.css";

interface AppProps {
  simulationPort?: SimulationPort;
}

const CONFIG_STORAGE_KEY = "mihai-simulation-config-v1";

type DiagnosticTab =
  | "difference"
  | "resets"
  | "cost-reset"
  | "maps"
  | "overflow"
  | "fragments"
  | "policy"
  | "sensitivity"
  | "benefit";

const DIAGNOSTIC_TABS: Array<{
  id: DiagnosticTab;
  label: string;
  shortLabel: string;
}> = [
  { id: "difference", label: "策略差值分布", shortLabel: "策略差值" },
  { id: "resets", label: "重置次数分布", shortLabel: "重置次数" },
  { id: "cost-reset", label: "成本 × 重置热力图", shortLabel: "成本 × 重置" },
  { id: "maps", label: "地图使用数分布", shortLabel: "地图数" },
  { id: "overflow", label: "碎片溢出分布", shortLabel: "碎片溢出" },
  { id: "fragments", label: "三类碎片取得次数", shortLabel: "碎片次数" },
  { id: "policy", label: "策略决策热力图", shortLabel: "决策热图" },
  { id: "sensitivity", label: "模型敏感性", shortLabel: "模型敏感性" },
  { id: "benefit", label: "相对基线收益", shortLabel: "基线收益" },
];

const PHASE_META: Record<RunPhase, { label: string; tone: string }> = {
  idle: { label: "待运行", tone: "neutral" },
  starting: { label: "正在准备", tone: "active" },
  running: { label: "模拟中", tone: "active" },
  pausing: { label: "正在暂停", tone: "warning" },
  paused: { label: "已暂停", tone: "warning" },
  stopping: { label: "正在停止", tone: "warning" },
  stopped: { label: "已停止", tone: "neutral" },
  completed: { label: "已完成", tone: "success" },
  error: { label: "发生错误", tone: "danger" },
};

const STAT_COLUMNS: Array<{
  key: string;
  label: string;
  value: (summary: SummaryStats) => string;
}> = [
  { key: "episodes", label: "已模拟", value: (s) => formatInteger(s.episodes) },
  { key: "successes", label: "成功局", value: (s) => formatInteger(s.successes) },
  { key: "failures", label: "失败局", value: (s) => formatInteger(s.failures) },
  { key: "failureRate", label: "失败率", value: (s) => formatPercent(s.failureRate, 4) },
  { key: "mean", label: "均值", value: (s) => formatDecimal(s.mean, 3) },
  { key: "se", label: "均值 SE", value: (s) => formatDecimal(s.standardError, 4) },
  {
    key: "ci",
    label: "均值 95% CI",
    value: (s) => `${formatDecimal(s.ci95Low, 3)}–${formatDecimal(s.ci95High, 3)}`,
  },
  { key: "sd", label: "标准差", value: (s) => formatDecimal(s.standardDeviation, 3) },
  { key: "variance", label: "方差", value: (s) => formatDecimal(s.variance, 3) },
  { key: "min", label: "最小", value: (s) => formatDecimal(s.minimum, 0) },
  { key: "max", label: "最大", value: (s) => formatDecimal(s.maximum, 0) },
  { key: "mode", label: "众数", value: (s) => formatDecimal(s.mode, 0) },
  { key: "p01", label: "P01", value: (s) => formatDecimal(s.percentiles.p01, 0) },
  { key: "p05", label: "P05", value: (s) => formatDecimal(s.percentiles.p05, 0) },
  { key: "p10", label: "P10", value: (s) => formatDecimal(s.percentiles.p10, 0) },
  { key: "p25", label: "P25", value: (s) => formatDecimal(s.percentiles.p25, 0) },
  { key: "p50", label: "P50", value: (s) => formatDecimal(s.percentiles.p50, 0) },
  { key: "p75", label: "P75", value: (s) => formatDecimal(s.percentiles.p75, 0) },
  { key: "p90", label: "P90", value: (s) => formatDecimal(s.percentiles.p90, 0) },
  { key: "p95", label: "P95", value: (s) => formatDecimal(s.percentiles.p95, 0) },
  { key: "p99", label: "P99", value: (s) => formatDecimal(s.percentiles.p99, 0) },
  { key: "cvar95", label: "CVaR95", value: (s) => formatDecimal(s.cvar95, 2) },
  { key: "cvar99", label: "CVaR99", value: (s) => formatDecimal(s.cvar99, 2) },
  { key: "skewness", label: "偏度", value: (s) => formatDecimal(s.skewness, 3) },
  { key: "kurtosis", label: "超额峰度", value: (s) => formatDecimal(s.excessKurtosis, 3) },
  { key: "meanResets", label: "平均重置", value: (s) => formatDecimal(s.meanResets, 2) },
  { key: "resetP50", label: "重置 P50", value: (s) => formatDecimal(s.resetP50, 0) },
  { key: "resetP95", label: "重置 P95", value: (s) => formatDecimal(s.resetP95, 0) },
  { key: "meanMaps", label: "平均地图数", value: (s) => formatDecimal(s.meanMaps, 2) },
  { key: "overflow", label: "平均溢出", value: (s) => formatDecimal(s.meanFragmentOverflow, 2) },
  { key: "below150", label: "< 150", value: (s) => formatPercent(s.belowBaselineRate, 2) },
  { key: "at150", label: "= 150", value: (s) => formatPercent(s.atBaselineRate, 2) },
  { key: "above150", label: "> 150", value: (s) => formatPercent(s.aboveBaselineRate, 2) },
  { key: "savings", label: "平均节省", value: (s) => formatDecimal(s.meanSavings, 2) },
  { key: "savingsRate", label: "节省比例", value: (s) => formatPercent(s.savingsRate, 2) },
];

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDecimal(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}时 ${minutes}分`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

function strategyColor(strategyId: string) {
  return (
    STRATEGY_OPTIONS.find((strategy) => strategy.id === strategyId)?.color ??
    "#27d3c2"
  );
}

function downloadChart(instance: EChartsType | undefined, filename: string) {
  if (!instance || instance.isDisposed()) return;
  const dataUrl = instance.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#081522",
    excludeComponents: ["toolbox"],
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${filename}.png`;
  link.click();
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="chart-empty" role="status">
      <ChartIcon />
      <strong>等待聚合数据</strong>
      <span>{message}</span>
    </div>
  );
}

function CardHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="card-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "is-active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "warning" | "danger";
}) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export default function App({ simulationPort }: AppProps) {
  const controller = useSimulationDashboard(simulationPort);
  const { snapshot } = controller;
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [activeModel, setActiveModel] = useState<ModelId>(
    DEFAULT_CONFIG.modelIds[0] ?? "M1",
  );
  const [histogramMode, setHistogramMode] = useState<"count" | "probability">(
    "count",
  );
  const [convergenceMode, setConvergenceMode] = useState<
    "mean" | "quantiles"
  >("mean");
  const [diagnosticTab, setDiagnosticTab] =
    useState<DiagnosticTab>("difference");
  const [ruleStrategyId, setRuleStrategyId] = useState(
    "optimized_threshold_v1",
  );
  const [pinnedStrategyIds, setPinnedStrategyIds] = useState([
    "optimized_threshold_v1",
    "expected_gain_greedy_gap",
    "optimized_conservative_150",
    "aggressive_threshold",
  ]);
  const [copyState, setCopyState] = useState("复制规则");
  const [configStorageState, setConfigStorageState] = useState(
    "配置保存在当前浏览器中",
  );
  const chartInstances = useRef(new Map<string, EChartsType>());

  const phaseMeta = PHASE_META[snapshot.phase];
  const configurationLocked = [
    "starting",
    "running",
    "pausing",
    "paused",
    "stopping",
  ].includes(snapshot.phase);
  const canStart =
    !configurationLocked &&
    config.modelIds.length > 0 &&
    config.strategyIds.length > 0 &&
    config.targetFragments > 0 &&
    config.episodesPerCombination > 0 &&
    config.batchSize > 0 &&
    config.masterSeed.trim().length > 0;
  const canPause = snapshot.phase === "running";
  const canResume = snapshot.phase === "paused";
  const canStop = ["starting", "running", "pausing", "paused"].includes(
    snapshot.phase,
  );
  const hasAnyResults = snapshot.summaries.some(
    (summary) => summary.episodes > 0,
  );

  useEffect(() => {
    if (!config.modelIds.includes(activeModel)) {
      setActiveModel(config.modelIds[0] ?? "M1");
    }
  }, [activeModel, config.modelIds]);

  const selectedModelSeries = useMemo(
    () =>
      snapshot.costHistograms.filter(
        (series) => series.modelId === activeModel,
      ),
    [activeModel, snapshot.costHistograms],
  );
  const selectedDistributions = useMemo(
    () =>
      snapshot.distributions.filter(
        (series) => series.modelId === activeModel,
      ),
    [activeModel, snapshot.distributions],
  );
  const selectedConvergence = useMemo(
    () =>
      snapshot.convergence.filter(
        (series) => series.modelId === activeModel,
      ),
    [activeModel, snapshot.convergence],
  );
  const selectedResets = useMemo(
    () =>
      snapshot.resetHistograms.filter(
        (series) => series.modelId === activeModel,
      ),
    [activeModel, snapshot.resetHistograms],
  );
  const primaryStrategyId =
    config.strategyIds.find((strategyId) => strategyId !== "full_clear") ??
    config.strategyIds[0] ??
    "optimized_threshold_v1";
  const primarySummary = snapshot.summaries.find(
    (summary) =>
      summary.modelId === activeModel &&
      summary.strategyId === primaryStrategyId,
  );
  const primaryPair = snapshot.pairedComparisons.find(
    (comparison) =>
      comparison.modelId === activeModel &&
      comparison.candidateStrategyId === primaryStrategyId,
  );
  const availableStrategyDefinitions = useMemo(() => {
    const liveById = new Map(
      snapshot.strategyDefinitions.map((definition) => [
        definition.id,
        definition,
      ]),
    );
    return STRATEGY_DEFINITIONS.map((catalogDefinition) => {
      const live = liveById.get(catalogDefinition.id);
      if (!live) return catalogDefinition;
      return {
        ...catalogDefinition,
        ...live,
        code: catalogDefinition.code,
        group: catalogDefinition.group,
        logic: catalogDefinition.logic,
        trigger: catalogDefinition.trigger,
        details: catalogDefinition.details,
        caveat: catalogDefinition.caveat,
        guardDescription: catalogDefinition.guardDescription,
        ruleSections:
          catalogDefinition.ruleSections ?? live.ruleSections,
        rules:
          live.rules.length > 0 ? live.rules : catalogDefinition.rules,
      };
    });
  }, [snapshot.strategyDefinitions]);
  const selectedRule =
    availableStrategyDefinitions.find(
      (definition) => definition.id === ruleStrategyId,
    ) ??
    availableStrategyDefinitions[0] ??
    null;
  const pinnedStrategies = pinnedStrategyIds
    .map((id) =>
      availableStrategyDefinitions.find((definition) => definition.id === id),
    )
    .filter((definition) => definition !== undefined);
  const plannedEpisodes =
    config.modelIds.length *
    config.strategyIds.length *
    config.episodesPerCombination;

  const registerChart = (id: string) => (instance: EChartsType) => {
    chartInstances.current.set(id, instance);
  };

  const toggleModel = (modelId: ModelId) => {
    setConfig((current) => {
      const selected = current.modelIds.includes(modelId);
      if (selected && current.modelIds.length === 1) return current;
      return {
        ...current,
        modelIds: selected
          ? current.modelIds.filter((id) => id !== modelId)
          : [...current.modelIds, modelId],
      };
    });
  };

  const toggleStrategy = (strategyId: string) => {
    setConfig((current) => {
      const selected = current.strategyIds.includes(strategyId);
      if (selected && current.strategyIds.length === 1) return current;
      return {
        ...current,
        strategyIds: selected
          ? current.strategyIds.filter((id) => id !== strategyId)
          : [...current.strategyIds, strategyId],
      };
    });
  };

  const applyStrategyPreset = (
    preset: "formal" | "probability" | "fragments" | "all",
  ) => {
    const ids =
      preset === "formal"
        ? [
            "optimized_threshold_v1",
            "optimized_conservative_150",
            "reset_on_30",
            "full_clear",
          ]
        : preset === "probability"
          ? [
              "optimized_threshold_v1",
              "expected_gain_greedy_gap",
              "full_clear",
            ]
        : preset === "fragments"
          ? STRATEGY_OPTIONS.filter(
              (strategy) =>
                strategy.group === "single" ||
                strategy.group === "all" ||
                strategy.group === "any",
            ).map((strategy) => strategy.id)
          : STRATEGY_OPTIONS.map((strategy) => strategy.id);
    setConfig((current) => ({ ...current, strategyIds: ids }));
  };

  const togglePinnedStrategy = (strategyId: string) => {
    setPinnedStrategyIds((current) =>
      current.includes(strategyId)
        ? current.length === 1
          ? current
          : current.filter((id) => id !== strategyId)
        : [...current.slice(-3), strategyId],
    );
  };

  const focusRule = (strategyId: string) => {
    setRuleStrategyId(strategyId);
    window.requestAnimationFrame(() => {
      document
        .getElementById("rules-title")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const updateNumber = (
    key:
      | "targetFragments"
      | "maxResets"
      | "episodesPerCombination"
      | "batchSize"
      | "workerCount",
    value: string,
  ) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setConfig((current) => ({
      ...current,
      [key]: Math.max(key === "maxResets" ? 0 : 1, Math.floor(parsed)),
    }));
  };

  const saveConfig = () => {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      setConfigStorageState("配置已保存");
    } catch {
      setConfigStorageState("配置保存失败");
    }
  };

  const loadConfig = () => {
    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) {
        setConfigStorageState("没有已保存配置");
        return;
      }
      const candidate = JSON.parse(raw) as Partial<SimulationConfig>;
      const modelIds = (candidate.modelIds ?? []).filter((id): id is ModelId =>
        MODEL_OPTIONS.some((model) => model.id === id),
      );
      const strategyIds = (candidate.strategyIds ?? []).filter((id) =>
        STRATEGY_OPTIONS.some((strategy) => strategy.id === id),
      );
      if (
        modelIds.length === 0 ||
        strategyIds.length === 0 ||
        typeof candidate.masterSeed !== "string" ||
        candidate.masterSeed.trim().length === 0
      ) {
        throw new Error("invalid saved configuration");
      }
      const restored: SimulationConfig = {
        ...DEFAULT_CONFIG,
        ...candidate,
        modelIds,
        strategyIds,
        targetFragments: Math.max(
          1,
          Math.floor(candidate.targetFragments ?? DEFAULT_CONFIG.targetFragments),
        ),
        maxResets: Math.max(
          0,
          Math.min(
            13,
            Math.floor(candidate.maxResets ?? DEFAULT_CONFIG.maxResets),
          ),
        ),
        episodesPerCombination: Math.max(
          1,
          Math.floor(
            candidate.episodesPerCombination ??
              DEFAULT_CONFIG.episodesPerCombination,
          ),
        ),
        batchSize: Math.max(
          1,
          Math.floor(candidate.batchSize ?? DEFAULT_CONFIG.batchSize),
        ),
        workerCount: Math.max(
          1,
          Math.floor(candidate.workerCount ?? DEFAULT_CONFIG.workerCount),
        ),
        masterSeed: candidate.masterSeed,
        runMode:
          candidate.runMode === "exploration" ||
          candidate.runMode === "validation" ||
          candidate.runMode === "formal"
            ? candidate.runMode
            : DEFAULT_CONFIG.runMode,
      };
      setConfig(restored);
      setActiveModel(restored.modelIds[0] ?? "M1");
      setConfigStorageState("已载入保存配置");
    } catch {
      setConfigStorageState("保存的配置无效");
    }
  };

  const copyRule = async (definition: StrategyDefinition | null) => {
    if (!definition) return;
    const lines = [
      `${definition.code ? `${definition.code} · ` : ""}${definition.name}`,
      `触发：${definition.trigger ?? definition.summary}`,
      `逻辑：${definition.logic ?? definition.kind}`,
      ...(definition.details ?? []).map((detail) => `说明：${detail}`),
      ...(definition.ruleSections?.flatMap((section) => [
        `【${section.title}】${section.description ?? ""}`,
        ...section.rules.map(
          (rule) =>
            `${rule.fragmentLabel}：${
              rule.action === "continue"
                ? "不主动重置"
                : rule.maxDepth === 25
                  ? "任意深度满足后请求重置"
                  : `第 ${rule.maxDepth} 格以内请求重置`
            }`,
        ),
      ]) ??
        definition.rules.map(
          (rule) =>
            `${rule.fragmentLabel}：${
              rule.action === "continue"
                ? "不主动重置"
                : `第 ${rule.maxDepth} 格以内请求重置`
            }`,
        )),
      `护栏：${definition.guardDescription}`,
      `注意：${definition.caveat}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyState("已复制");
    } catch {
      setCopyState("复制失败");
    }
    window.setTimeout(() => setCopyState("复制规则"), 1_600);
  };

  const renderDiagnosticChart = () => {
    const chartId = `diagnostic-${diagnosticTab}`;
    const commonProps = {
      className: "chart-large",
      onReady: registerChart(chartId),
    };
    if (diagnosticTab === "difference") {
      if (!primaryPair?.histogram.length) {
        return <EmptyChart message="成对运行后将生成策略成本差值分布。" />;
      }
      return (
        <EChart
          {...commonProps}
          option={pairedDifferenceOption(primaryPair)}
          ariaLabel={`${primaryPair.candidateStrategyName}相对全开基线的成本差值分布`}
        />
      );
    }
    if (diagnosticTab === "resets") {
      if (!selectedResets.length) {
        return <EmptyChart message="运行后将显示 0–13 次重置的局数占比。" />;
      }
      return (
        <EChart
          {...commonProps}
          option={resetHistogramOption(selectedResets)}
          ariaLabel={`${activeModel} 下各策略的重置次数分布`}
        />
      );
    }
    if (diagnosticTab === "cost-reset") {
      const heatmap = snapshot.costResetHeatmaps.find(
        (item) =>
          item.modelId === activeModel &&
          item.strategyId === primaryStrategyId,
      );
      if (!heatmap) {
        return <EmptyChart message="Worker 产生成本与重置联合计数后显示热力图。" />;
      }
      return (
        <EChart
          {...commonProps}
          option={costResetHeatmapOption(heatmap)}
          ariaLabel={`${activeModel} ${heatmap.strategyName}的成本与重置次数联合热力图`}
        />
      );
    }
    if (diagnosticTab === "maps" || diagnosticTab === "overflow") {
      const metric =
        diagnosticTab === "maps" ? "map-count" : "fragment-overflow";
      const source = snapshot.integerHistograms.filter(
        (item) => item.modelId === activeModel && item.metric === metric,
      );
      if (!source.length) {
        return (
          <EmptyChart
            message={
              diagnosticTab === "maps"
                ? "运行后将显示完成目标时进入的地图张数。"
                : "运行后将显示最终碎片相对目标的溢出量。"
            }
          />
        );
      }
      return (
        <EChart
          {...commonProps}
          option={integerHistogramOption(source, metric)}
          ariaLabel={
            diagnosticTab === "maps"
              ? `${activeModel} 下地图使用数分布`
              : `${activeModel} 下最终碎片溢出分布`
          }
        />
      );
    }
    if (diagnosticTab === "fragments") {
      const source = snapshot.fragmentAcquisitions.filter(
        (item) =>
          item.modelId === activeModel &&
          item.strategyId === primaryStrategyId,
      );
      if (!source.length) {
        return <EmptyChart message="运行后将分别显示 5、15、30 碎片取得次数。" />;
      }
      return (
        <EChart
          {...commonProps}
          option={fragmentAcquisitionOption(source)}
          ariaLabel={`${activeModel} ${primarySummary?.strategyName ?? ""}三类碎片取得次数分布`}
        />
      );
    }
    if (diagnosticTab === "policy") {
      const heatmap = snapshot.policyDecisionHeatmaps.find(
        (item) => item.strategyId === primaryStrategyId,
      );
      if (!heatmap) {
        return <EmptyChart message="策略生成可序列化决策表后显示继续与重置区域。" />;
      }
      return (
        <EChart
          {...commonProps}
          option={policyHeatmapOption(heatmap)}
          ariaLabel={`${heatmap.strategyName}按地图深度与碎片状态的决策热力图`}
        />
      );
    }
    if (diagnosticTab === "sensitivity") {
      if (!snapshot.sensitivity.length) {
        return <EmptyChart message="同一策略在 M1/M2/M3 全部完成后生成敏感性对比。" />;
      }
      return (
        <EChart
          {...commonProps}
          option={sensitivityOption(snapshot.sensitivity)}
          ariaLabel="各策略在三种抽奖假设模型下的均值、P95 与 P99 对比"
        />
      );
    }
    const source = snapshot.baselineBenefits.filter(
      (item) => item.strategyId !== "full_clear",
    );
    if (!source.length) {
      return <EmptyChart message="成对比较完成后显示相对全开基线的节省与胜负率。" />;
    }
    return (
      <EChart
        {...commonProps}
        option={baselineBenefitOption(source)}
        ariaLabel="各策略相对全开基线的平均节省次数与胜负比例"
      />
    );
  };

  const histogramOption = useMemo(
    () => costHistogramOption(selectedModelSeries, histogramMode),
    [histogramMode, selectedModelSeries],
  );
  const selectedDistributionOption = useMemo(
    () => distributionOption(selectedDistributions, "tail"),
    [selectedDistributions],
  );
  const selectedConvergenceOption = useMemo(
    () => convergenceOption(selectedConvergence, convergenceMode),
    [convergenceMode, selectedConvergence],
  );

  return (
    <div className="app">
      <a className="skip-link" href="#dashboard-main">
        跳到主要结果
      </a>

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <CompassIcon width={23} height={23} />
          </div>
          <div>
            <span className="brand-kicker">MONTE CARLO NAVIGATOR</span>
            <h1>迷海寻宝 · 策略实验室</h1>
          </div>
        </div>
        <div className="topbar-meta">
          <div className={`status-pill status-${phaseMeta.tone}`}>
            <span className="status-dot" />
            {phaseMeta.label}
          </div>
          <div className="run-identity">
            <span>{snapshot.progress.stageLabel}</span>
            <strong>{snapshot.runId}</strong>
          </div>
        </div>
      </header>

      {controller.isDemo ? (
        <div className="demo-banner" role="note">
          <InfoIcon />
          <div>
            <strong>界面演示模式</strong>
            <span>
              当前数据仅用于预览交互和图表布局，不是正式模拟结果。接入真实 Worker
              后会自动替换。
            </span>
          </div>
        </div>
      ) : null}

      <div className="workspace">
        <aside className="control-panel" aria-label="模拟参数与运行控制">
          <div className="control-panel-heading">
            <div>
              <span className="eyebrow">RUN CONFIGURATION</span>
              <h2>航行参数</h2>
            </div>
            <span className="config-lock">
              {configurationLocked ? "运行中已锁定" : "可编辑"}
            </span>
          </div>

          <fieldset disabled={configurationLocked}>
            <legend>抽奖假设模型</legend>
            <p className="field-hint">至少选择一个；M1 为主结论模型。</p>
            <div className="option-stack">
              {MODEL_OPTIONS.map((model) => {
                const selected = config.modelIds.includes(model.id);
                return (
                  <label
                    key={model.id}
                    className={`choice-card ${selected ? "is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleModel(model.id)}
                    />
                    <span className="choice-check" aria-hidden="true" />
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.description}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset
            className="strategy-fieldset"
            disabled={configurationLocked}
          >
            <legend>对比策略</legend>
            <p className="field-hint">
              已选 {config.strategyIds.length} / {STRATEGY_OPTIONS.length} 条；
              AND 表示同图全部取得，OR 表示同图任一取得。
            </p>
            <div className="strategy-presets" aria-label="策略选择预设">
              <button
                type="button"
                onClick={() => applyStrategyPreset("formal")}
              >
                正式四项
              </button>
              <button
                type="button"
                onClick={() => applyStrategyPreset("fragments")}
              >
                全部碎片基线
              </button>
              <button
                type="button"
                onClick={() => applyStrategyPreset("probability")}
              >
                概率策略三项
              </button>
              <button type="button" onClick={() => applyStrategyPreset("all")}>
                全选{STRATEGY_OPTIONS.length}项
              </button>
            </div>
            <p className="strategy-run-size">
              当前计划共模拟 {formatInteger(plannedEpisodes)} 局；策略越多，运行时间按组合数增加。
            </p>
            <div className="strategy-catalog">
              {STRATEGY_GROUPS.map((group) => {
                const groupStrategies = STRATEGY_OPTIONS.filter(
                  (strategy) => strategy.group === group.id,
                );
                return (
                  <section key={group.id} className="strategy-group">
                    <header>
                      <div>
                        <strong>{group.label}</strong>
                        <small>{group.explanation}</small>
                      </div>
                      <span>{groupStrategies.length} 条</span>
                    </header>
                    <div className="option-stack strategy-options">
                      {groupStrategies.map((strategy) => {
                        const selected = config.strategyIds.includes(
                          strategy.id,
                        );
                        const pinned = pinnedStrategyIds.includes(strategy.id);
                        return (
                          <article
                            key={strategy.id}
                            data-strategy-id={strategy.id}
                            className={`strategy-catalog-card ${selected ? "is-selected" : ""}`}
                          >
                            <label className="choice-card strategy-choice">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleStrategy(strategy.id)}
                              />
                              <span
                                className="choice-check"
                                aria-hidden="true"
                              />
                              <span
                                className="strategy-color"
                                style={{
                                  "--strategy-color": strategy.color,
                                } as React.CSSProperties}
                                aria-hidden="true"
                              />
                              <span>
                                <strong>
                                  <b>{strategy.code}</b>
                                  {strategy.name}
                                  {strategy.recommended ? (
                                    <em>主推方向</em>
                                  ) : null}
                                </strong>
                                <small>{strategy.description}</small>
                              </span>
                            </label>
                            <div className="strategy-rule-preview">
                              <span className={`logic-badge logic-${strategy.group}`}>
                                {strategy.logic}
                              </span>
                              <p>{strategy.trigger}</p>
                            </div>
                            <details>
                              <summary>展开具体规则</summary>
                              <ul>
                                {strategy.details.map((detail) => (
                                  <li key={detail}>{detail}</li>
                                ))}
                              </ul>
                              <p className="strategy-card-guard">
                                公共护栏：{strategy.guardDescription}
                              </p>
                            </details>
                            <div className="strategy-card-actions">
                              <button
                                type="button"
                                className={pinned ? "is-pinned" : ""}
                                onClick={() =>
                                  togglePinnedStrategy(strategy.id)
                                }
                              >
                                {pinned ? "已加入规则对照" : "加入规则对照"}
                              </button>
                              <button
                                type="button"
                                onClick={() => focusRule(strategy.id)}
                              >
                                查看完整表
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="parameter-grid" disabled={configurationLocked}>
            <legend>运行规模</legend>
            <label>
              <span>目标碎片</span>
              <input
                type="number"
                min={100}
                step={50}
                value={config.targetFragments}
                onChange={(event) =>
                  updateNumber("targetFragments", event.target.value)
                }
              />
            </label>
            <label>
              <span>最多重置</span>
              <div className="input-suffix">
                <input
                  type="number"
                  min={0}
                  max={13}
                  value={config.maxResets}
                  onChange={(event) =>
                    updateNumber("maxResets", event.target.value)
                  }
                />
                <small>次</small>
              </div>
            </label>
            <label className="span-two">
              <span>每组合总局数</span>
              <select
                value={config.episodesPerCombination}
                onChange={(event) =>
                  updateNumber("episodesPerCombination", event.target.value)
                }
              >
                <option value={100_000}>100,000 · 快速校验</option>
                <option value={500_000}>500,000</option>
                <option value={1_000_000}>1,000,000 · 正式默认</option>
                <option value={5_000_000}>5,000,000 · 精细比较</option>
              </select>
            </label>
            <label>
              <span>更新批次</span>
              <select
                value={config.batchSize}
                onChange={(event) =>
                  updateNumber("batchSize", event.target.value)
                }
              >
                <option value={1_000}>1,000 局</option>
                <option value={5_000}>5,000 局</option>
                <option value={10_000}>10,000 局</option>
                <option value={50_000}>50,000 局</option>
              </select>
            </label>
            <label>
              <span>Worker 数</span>
              <input
                type="number"
                min={1}
                max={32}
                value={config.workerCount}
                onChange={(event) =>
                  updateNumber("workerCount", event.target.value)
                }
              />
            </label>
            <label className="span-two">
              <span>运行用途</span>
              <select
                value={config.runMode}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    runMode: event.target.value as SimulationConfig["runMode"],
                  }))
                }
              >
                <option value="exploration">探索调参</option>
                <option value="validation">候选验证</option>
                <option value="formal">正式评估</option>
              </select>
            </label>
            <label className="span-two">
              <span>主随机种子</span>
              <input
                className="seed-input"
                type="text"
                spellCheck={false}
                value={config.masterSeed}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    masterSeed: event.target.value,
                  }))
                }
              />
            </label>
          </fieldset>

          <div className="run-actions" aria-label="运行控制">
            <button
              type="button"
              className="button button-primary"
              disabled={!canStart}
              onClick={() => controller.start(config)}
            >
              <PlayIcon />
              启动
            </button>
            {canResume ? (
              <button
                type="button"
                className="button button-primary"
                onClick={controller.resume}
              >
                <PlayIcon />
                继续
              </button>
            ) : (
              <button
                type="button"
                className="button"
                disabled={!canPause}
                onClick={controller.pause}
              >
                <PauseIcon />
                暂停
              </button>
            )}
            <button
              type="button"
              className="button"
              disabled={!canStop}
              onClick={controller.stop}
            >
              <StopIcon />
              停止
            </button>
            <button
              type="button"
              className="button button-subtle"
              disabled={configurationLocked}
              onClick={controller.reset}
            >
              <ResetIcon />
              重置结果
            </button>
          </div>

          <div className="export-block">
            <span>数据导出</span>
            <div>
              <button
                type="button"
                className="button button-export"
                disabled={!hasAnyResults}
                onClick={() => controller.exportRun("zip")}
              >
                <DownloadIcon />
                全部 ZIP
              </button>
              <button
                type="button"
                className="button button-icon"
                aria-label="导出 JSON"
                title="导出 JSON"
                disabled={!hasAnyResults}
                onClick={() => controller.exportRun("json")}
              >
                JSON
              </button>
              <button
                type="button"
                className="button button-icon"
                aria-label="导出 CSV"
                title="导出 CSV"
                disabled={!hasAnyResults}
                onClick={() => controller.exportRun("csv")}
              >
                CSV
              </button>
            </div>
          </div>

          <div className="config-storage-block">
            <span>{configStorageState}</span>
            <div>
              <button
                type="button"
                className="button button-subtle"
                disabled={configurationLocked}
                onClick={saveConfig}
              >
                保存配置
              </button>
              <button
                type="button"
                className="button button-subtle"
                disabled={configurationLocked}
                onClick={loadConfig}
              >
                载入配置
              </button>
            </div>
          </div>
        </aside>

        <main id="dashboard-main" className="dashboard">
          {controller.notice ? (
            <div
              className={`notice notice-${controller.notice.kind}`}
              role={controller.notice.kind === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              <span>{controller.notice.message}</span>
              <button
                type="button"
                aria-label="关闭提示"
                onClick={controller.clearNotice}
              >
                ×
              </button>
            </div>
          ) : null}

          <section className="run-overview" aria-labelledby="run-overview-title">
            <div className="progress-copy">
              <div className="section-label-row">
                <div>
                  <span className="eyebrow">LIVE RUN</span>
                  <h2 id="run-overview-title">模拟进度</h2>
                </div>
                <strong>{formatPercent(snapshot.progress.progress, 1)}</strong>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="模拟完成进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(snapshot.progress.progress * 100)}
              >
                <span
                  style={{
                    width: `${Math.min(100, snapshot.progress.progress * 100)}%`,
                  }}
                />
              </div>
              <div className="progress-foot">
                <span>
                  {formatInteger(snapshot.progress.completedEpisodes)}
                  <small> / {formatInteger(snapshot.progress.totalEpisodes)} 局</small>
                </span>
                <span>
                  批次 {formatInteger(snapshot.progress.currentBatch)}
                  <small> / {formatInteger(snapshot.progress.totalBatches)}</small>
                </span>
              </div>
            </div>
            <div className="live-facts">
              <div>
                <span>实时速度</span>
                <strong>
                  {snapshot.progress.episodesPerSecond > 0
                    ? formatCompact(snapshot.progress.episodesPerSecond)
                    : "—"}
                  <small> 局/秒</small>
                </strong>
              </div>
              <div>
                <span>已运行</span>
                <strong>{formatDuration(snapshot.progress.elapsedMs)}</strong>
              </div>
              <div>
                <span>预计剩余</span>
                <strong>
                  {formatDuration(snapshot.progress.estimatedRemainingMs)}
                </strong>
              </div>
              <div>
                <span>活动 Worker</span>
                <strong>
                  {snapshot.progress.activeWorkers}
                  <small> / {snapshot.config.workerCount}</small>
                </strong>
              </div>
            </div>
          </section>

          <section
            className="data-card strategy-compare-card"
            aria-labelledby="strategy-compare-title"
          >
            <CardHeading
              eyebrow="RULE COMPARISON"
              title="策略规则对照"
              description="默认并排展示原列表中的第1、2、5项；可在左侧把任意策略加入对照，最多保留4项。"
              actions={
                <span className="row-count">
                  {pinnedStrategies.length} / 4 项
                </span>
              }
            />
            <div className="strategy-compare-grid">
              {pinnedStrategies.map((definition) => (
                <article
                  key={definition.id}
                  data-compare-strategy-id={definition.id}
                  style={{
                    "--strategy-color": strategyColor(definition.id),
                  } as React.CSSProperties}
                >
                  <header>
                    <span className="strategy-code">
                      {definition.code ?? definition.id}
                    </span>
                    <span className="logic-badge">
                      {definition.logic ?? definition.kind}
                    </span>
                    <h3>{definition.name}</h3>
                    <code>{definition.id}</code>
                  </header>
                  <dl>
                    <div>
                      <dt>何时请求重置</dt>
                      <dd>{definition.trigger ?? definition.summary}</dd>
                    </div>
                    <div>
                      <dt>具体内容</dt>
                      <dd>
                        <ul>
                          {(definition.details ?? [definition.summary]).map(
                            (detail) => (
                              <li key={detail}>{detail}</li>
                            ),
                          )}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt>最终护栏</dt>
                      <dd>{definition.guardDescription}</dd>
                    </div>
                    <div>
                      <dt>代价与用途</dt>
                      <dd>{definition.caveat}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="button button-compact"
                    onClick={() => focusRule(definition.id)}
                  >
                    查看完整决策表
                  </button>
                </article>
              ))}
            </div>
          </section>

          <ExamPanel className="exam-panel" />

          <nav className="model-switcher" aria-label="当前图表模型">
            <span>查看模型</span>
            {snapshot.config.modelIds.map((modelId) => (
              <button
                key={modelId}
                type="button"
                className={activeModel === modelId ? "is-active" : ""}
                aria-current={activeModel === modelId ? "true" : undefined}
                onClick={() => setActiveModel(modelId)}
              >
                {MODEL_OPTIONS.find((model) => model.id === modelId)?.shortName ??
                  modelId}
              </button>
            ))}
            <small>
              {MODEL_OPTIONS.find((model) => model.id === activeModel)?.description}
            </small>
          </nav>

          <section className="hero-grid" aria-label="核心模拟结果">
            <article className="data-card histogram-card">
              <CardHeading
                eyebrow="PRIMARY DISTRIBUTION"
                title="操作成本分布"
                description={
                  histogramMode === "count"
                    ? `横轴为完成 ${snapshot.config.targetFragments} 碎片所需操作 1 次数，纵轴为恰好落入该成本的局数；橙色虚线为 150 次全开基线。`
                    : `成本 x 处显示累计概率 P(操作 1 成本 ≤ x)，即从最低成本到 x 的全部概率之和。`
                }
                actions={
                  <>
                    <SegmentedControl
                      label="直方图纵轴"
                      value={histogramMode}
                      options={[
                        { value: "count", label: "局数" },
                        { value: "probability", label: "累计概率" },
                      ]}
                      onChange={setHistogramMode}
                    />
                    <button
                      type="button"
                      className="icon-action"
                      aria-label="下载成本分布 PNG"
                      title="下载 PNG"
                      onClick={() =>
                        downloadChart(
                          chartInstances.current.get("histogram"),
                          "cost-histogram",
                        )
                      }
                    >
                      <DownloadIcon />
                    </button>
                  </>
                }
              />
              {selectedModelSeries.some((series) =>
                series.bins.some((bin) => bin.count > 0),
              ) ? (
                <EChart
                  className="chart-hero"
                  option={histogramOption}
                  ariaLabel={
                    histogramMode === "count"
                      ? `${activeModel} 下各策略完成目标所需操作次数的局数直方图`
                      : `${activeModel} 下各策略完成目标所需操作次数的累计概率曲线`
                  }
                  onReady={registerChart("histogram")}
                />
              ) : (
                <EmptyChart message="首个批次完成后，每 10,000 局重绘一次。" />
              )}
              <div className="chart-legend-note">
                <span>
                  <i className="baseline-swatch" /> 150 次确定性基线
                </span>
                <span>
                  {histogramMode === "count"
                    ? "局数是单点频数；滚轮或拖动底部滑块可放大尾部"
                    : "例如成本139显示所有成本≤139的累计概率"}
                </span>
              </div>
            </article>

            <aside className="decision-card" aria-labelledby="decision-title">
              <div className="decision-heading">
                <div>
                  <span className="eyebrow">DECISION SNAPSHOT</span>
                  <h2 id="decision-title">当前决策摘要</h2>
                </div>
                <span
                  className={`provenance provenance-${snapshot.provenance}`}
                >
                  {snapshot.provenance === "live"
                    ? "实时数据"
                    : snapshot.provenance === "imported"
                      ? "导入结果"
                      : "演示数据"}
                </span>
              </div>

              {primarySummary && primarySummary.episodes > 0 ? (
                <>
                  <div className="primary-result">
                    <span>{primarySummary.strategyName}</span>
                    <div>
                      <strong>{formatDecimal(primarySummary.mean, 2)}</strong>
                      <small>平均操作 1 次数</small>
                    </div>
                    <p>
                      95% CI {formatDecimal(primarySummary.ci95Low, 3)}–
                      {formatDecimal(primarySummary.ci95High, 3)}
                    </p>
                  </div>
                  <div className="metric-grid">
                    <Metric
                      label="平均节省"
                      value={`${formatDecimal(primarySummary.meanSavings, 2)} 次`}
                      detail={formatPercent(primarySummary.savingsRate, 2)}
                      tone="good"
                    />
                    <Metric
                      label="P95 / P99"
                      value={`${primarySummary.percentiles.p95} / ${primarySummary.percentiles.p99}`}
                      detail="尾部成本"
                      tone={
                        primarySummary.percentiles.p99 > 150
                          ? "warning"
                          : "good"
                      }
                    />
                    <Metric
                      label="超过 150"
                      value={formatPercent(
                        primarySummary.aboveBaselineRate,
                        2,
                      )}
                      detail={`CVaR95 ${formatDecimal(primarySummary.cvar95, 1)}`}
                      tone={
                        primarySummary.aboveBaselineRate > 0.05
                          ? "danger"
                          : "warning"
                      }
                    />
                    <Metric
                      label="平均重置"
                      value={`${formatDecimal(primarySummary.meanResets, 2)} 次`}
                      detail={`P95 ${primarySummary.resetP95} 次`}
                    />
                  </div>
                  <div className="paired-callout">
                    <span>成对比较全开基线</span>
                    <strong>
                      {primaryPair
                        ? `${formatPercent(primaryPair.winRate, 1)} 胜率`
                        : "等待配对数据"}
                    </strong>
                    <small>
                      {primaryPair
                        ? `平均差 ${formatDecimal(primaryPair.meanDifference, 2)} 次；95% CI ${formatDecimal(primaryPair.ci95Low, 2)} 至 ${formatDecimal(primaryPair.ci95High, 2)}`
                        : "同一局编号将复用底层地图序列"}
                    </small>
                  </div>
                </>
              ) : (
                <div className="decision-empty">
                  <CompassIcon />
                  <strong>等待首个批次</strong>
                  <span>完成后将显示均值、尾部风险与成对胜率。</span>
                </div>
              )}

              <div className="assumption-note">
                <AlertIcon />
                <p>
                  <strong>模型边界</strong>
                  M1/M2/M3 均是假设，不代表已识别游戏内部算法。最终决策应同时检查三模型敏感性。
                </p>
              </div>
            </aside>
          </section>

          <section className="chart-grid" aria-label="概率与收敛诊断">
            <article className="data-card">
              <CardHeading
                eyebrow="PROBABILITY"
                title="尾部生存曲线"
                description="主图已经提供累计完成概率；这里专门以对数纵轴显示 P(成本 > x)，便于检查极少数高成本结果。"
              />
              {selectedDistributions.some((series) => series.survival.length) ? (
                <EChart
                  className="chart-standard"
                  option={selectedDistributionOption}
                  ariaLabel={`${activeModel} 下各策略超出给定成本的尾部概率曲线`}
                  onReady={registerChart("distribution")}
                />
              ) : (
                <EmptyChart message="成本直方图形成后自动生成精确整数尾部概率。" />
              )}
            </article>

            <article className="data-card">
              <CardHeading
                eyebrow="STABILITY"
                title={
                  convergenceMode === "mean"
                    ? "均值与置信区间收敛"
                    : "关键分位数收敛"
                }
                description={
                  convergenceMode === "mean"
                    ? "检查增加样本后结论是否稳定；主策略附 95% CI。"
                    : "观察 P50、P90、P95、P99 是否停止漂移。"
                }
                actions={
                  <SegmentedControl
                    label="收敛指标"
                    value={convergenceMode}
                    options={[
                      { value: "mean", label: "均值" },
                      { value: "quantiles", label: "分位数" },
                    ]}
                    onChange={setConvergenceMode}
                  />
                }
              />
              {selectedConvergence.some((series) => series.points.length) ? (
                <EChart
                  className="chart-standard"
                  option={selectedConvergenceOption}
                  ariaLabel={
                    convergenceMode === "mean"
                      ? `${activeModel} 下各策略均值和置信区间随样本量的收敛图`
                      : `${activeModel} 主策略关键分位数随样本量的收敛图`
                  }
                  onReady={registerChart("convergence")}
                />
              ) : (
                <EmptyChart message="至少完成一个批次后绘制收敛轨迹。" />
              )}
            </article>
          </section>

          <section className="data-card diagnostics-card" aria-labelledby="diagnostics-title">
            <CardHeading
              eyebrow="DECISION DIAGNOSTICS"
              title="决策诊断"
              description="从成对收益、资源使用和模型不确定性三个角度检查进取策略。"
              actions={
                <button
                  type="button"
                  className="icon-action"
                  aria-label={`下载${DIAGNOSTIC_TABS.find((tab) => tab.id === diagnosticTab)?.label ?? "诊断图"} PNG`}
                  title="下载当前图 PNG"
                  onClick={() =>
                    downloadChart(
                      chartInstances.current.get(`diagnostic-${diagnosticTab}`),
                      `mihai-${diagnosticTab}`,
                    )
                  }
                >
                  <DownloadIcon />
                </button>
              }
            />
            <div className="diagnostic-tabs" role="tablist" aria-label="诊断图表">
              {DIAGNOSTIC_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`diagnostic-tab-${tab.id}`}
                  aria-selected={diagnosticTab === tab.id}
                  aria-controls="diagnostic-panel"
                  tabIndex={diagnosticTab === tab.id ? 0 : -1}
                  className={diagnosticTab === tab.id ? "is-active" : ""}
                  onClick={() => setDiagnosticTab(tab.id)}
                >
                  <span className="tab-full">{tab.label}</span>
                  <span className="tab-short">{tab.shortLabel}</span>
                </button>
              ))}
            </div>
            <div
              id="diagnostic-panel"
              role="tabpanel"
              aria-labelledby={`diagnostic-tab-${diagnosticTab}`}
              className="diagnostic-panel"
            >
              {renderDiagnosticChart()}
            </div>
          </section>

          <section className="data-card table-card" aria-labelledby="stats-title">
            <CardHeading
              eyebrow="FULL STATISTICS"
              title="完整统计表"
              description="所有决策指标均保留；横向滚动查看置信区间、完整分位数、CVaR 与资源消耗。"
              actions={
                <span className="row-count">
                  {snapshot.summaries.length} 个模型 × 策略组合
                </span>
              }
            />
            <div className="table-scroll" tabIndex={0} aria-label="可横向滚动的完整统计表">
              <table>
                <caption className="sr-only">
                  模拟中每个抽奖模型与策略组合的完整统计指标
                </caption>
                <thead>
                  <tr>
                    <th className="sticky-col sticky-col-first" scope="col">
                      模型
                    </th>
                    <th className="sticky-col sticky-col-second" scope="col">
                      策略
                    </th>
                    {STAT_COLUMNS.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.summaries.map((summary) => (
                    <tr key={summary.key}>
                      <th className="sticky-col sticky-col-first" scope="row">
                        <span className="model-badge">{summary.modelId}</span>
                      </th>
                      <th className="sticky-col sticky-col-second" scope="row">
                        <span
                          className="table-strategy-dot"
                          style={{
                            "--strategy-color": strategyColor(
                              summary.strategyId,
                            ),
                          } as React.CSSProperties}
                        />
                        {summary.strategyName}
                      </th>
                      {STAT_COLUMNS.map((column) => (
                        <td
                          key={column.key}
                          className={
                            column.key === "mean" ||
                            column.key === "p95" ||
                            column.key === "p99"
                              ? "cell-emphasis"
                              : column.key === "above150" &&
                                  summary.aboveBaselineRate > 0.05
                                ? "cell-risk"
                                : ""
                          }
                        >
                          {summary.episodes > 0 ||
                          ["episodes", "successes", "failures"].includes(
                            column.key,
                          )
                            ? column.value(summary)
                            : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="data-card rules-card" aria-labelledby="rules-title">
            <CardHeading
              eyebrow="PLAYER POLICY"
              title="可执行策略规则"
              description="程序内部策略必须在这里还原为玩家可以手动遵循的规则。"
              actions={
                <button
                  type="button"
                  className="button button-compact"
                  onClick={() => void copyRule(selectedRule)}
                >
                  <CopyIcon />
                  {copyState}
                </button>
              }
            />
            <div className="rule-layout">
              <nav className="rule-nav" aria-label="选择策略规则">
                {availableStrategyDefinitions.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    className={
                      definition.id === selectedRule?.id ? "is-active" : ""
                    }
                    aria-current={
                      definition.id === selectedRule?.id ? "true" : undefined
                    }
                    onClick={() => setRuleStrategyId(definition.id)}
                  >
                    <span
                      style={{
                        "--strategy-color": strategyColor(definition.id),
                      } as React.CSSProperties}
                    />
                    <div>
                      <strong>
                        {definition.code ? `${definition.code} · ` : ""}
                        {definition.name}
                      </strong>
                      <small>
                        {definition.logic ??
                          (definition.kind === "aggressive"
                            ? "主推方向"
                            : definition.kind === "conservative"
                              ? "尾部参照"
                              : "基线")}
                      </small>
                    </div>
                  </button>
                ))}
              </nav>
              {selectedRule ? (
                <div className="rule-detail">
                  <div className="rule-summary">
                    <span
                      className={`policy-kind policy-${selectedRule.kind}`}
                    >
                      {selectedRule.kind === "aggressive"
                        ? "进取"
                        : selectedRule.kind === "conservative"
                          ? "保守"
                          : "基线"}
                    </span>
                    <h3>
                      {selectedRule.code ? `${selectedRule.code} · ` : ""}
                      {selectedRule.name}
                    </h3>
                    <p className="rule-trigger">
                      <strong>请求条件：</strong>
                      {selectedRule.trigger ?? selectedRule.summary}
                    </p>
                    {selectedRule.details?.length ? (
                      <ul className="rule-detail-list">
                        {selectedRule.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {selectedRule.ruleSections?.length ? (
                    <div className="rule-table-wrap threshold-matrix-wrap">
                      {selectedRule.ruleSections.length > 1 ? (
                        <p className="rule-priority">
                          实际覆盖优先级：距目标1–100分段 ＞
                          剩余重置次数分段 ＞ 基础兜底。格内“≤N”表示在本图第N格以内满足状态时请求重置。
                        </p>
                      ) : null}
                      <table className="rule-table threshold-matrix">
                        <thead>
                          <tr>
                            <th scope="col">本图已取得</th>
                            {selectedRule.ruleSections.map((section) => (
                              <th key={section.title} scope="col">
                                {section.title}
                                {section.description ? (
                                  <small>{section.description}</small>
                                ) : null}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRule.ruleSections[0]?.rules.map(
                            (referenceRule, rowIndex) => (
                              <tr key={referenceRule.fragmentMask}>
                                <th scope="row">
                                  {referenceRule.fragmentLabel}
                                </th>
                                {selectedRule.ruleSections?.map((section) => {
                                  const rule = section.rules[rowIndex];
                                  return (
                                    <td key={section.title}>
                                      {!rule || rule.action === "continue"
                                        ? "从不"
                                        : rule.maxDepth === 25
                                          ? "任意深度"
                                          : `≤ ${rule.maxDepth}`}
                                    </td>
                                  );
                                })}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : selectedRule.rules.length ? (
                    <div className="rule-table-wrap">
                      <table className="rule-table">
                        <thead>
                          <tr>
                            <th scope="col">当前地图已取得</th>
                            <th scope="col">深度条件</th>
                            <th scope="col">建议动作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRule.rules.map((rule) => (
                            <tr key={rule.fragmentMask}>
                              <th scope="row">{rule.fragmentLabel}</th>
                              <td>
                                {rule.action === "continue"
                                  ? "任意深度"
                                  : `第 ${rule.maxDepth} 格以内`}
                              </td>
                              <td>
                                <span
                                  className={`action-chip action-${rule.action}`}
                                >
                                  {rule.action === "continue"
                                    ? "继续打开"
                                    : rule.action === "reset"
                                      ? "通过护栏后重置"
                                      : "考虑重置"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="simple-rule">
                      <CompassIcon />
                      <p>
                        <strong>{selectedRule.logic ?? "固定规则"}：</strong>
                        {selectedRule.trigger ?? selectedRule.summary}
                      </p>
                    </div>
                  )}
                  <div className="guardrail">
                    <div>
                      <strong>100% 完成护栏</strong>
                      <code>S + 100 × R ≥ 600</code>
                    </div>
                    <p>{selectedRule.guardDescription}</p>
                  </div>
                  <p className="rule-caveat">
                    <AlertIcon />
                    {selectedRule.caveat}
                  </p>
                </div>
              ) : (
                <div className="rule-detail">
                  <EmptyChart message="策略定义随聚合快照一起加载。" />
                </div>
              )}
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>
              快照序号 #{snapshot.sequence} · {snapshot.generatedAt}
            </span>
            <span>
              种子 <code>{snapshot.config.masterSeed}</code> · 批次{" "}
              {formatInteger(snapshot.config.batchSize)}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
