import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MODEL_DEFINITIONS, MODEL_IDS, type ModelId } from "../domain";
import {
  DEFAULT_FIXED_HORIZON_STRATEGY_IDS,
  FIXED_HORIZON_EXAM_STRATEGIES,
  FIXED_HORIZON_EXAM_STRATEGY_BY_ID,
  FIXED_HORIZON_WRAPPER_ALIASES,
} from "../exam/catalog";
import type { FixedHorizonCoreStrategyId } from "../exam/fixedHorizon";
import {
  FIXED_EXAM_CHECKPOINT_START,
  FIXED_EXAM_HORIZON,
  FIXED_EXAM_MAX_RESETS,
  type ExamCurvePoint,
  type ExamPhase,
  type FixedHorizonExamConfig,
} from "../exam/types";
import {
  examConditionalHeatmapOption,
  examPairedDifferenceOption,
  examResetCurveOption,
  examScoreCurveOption,
  type ExamScoreMetric,
} from "./examChartOptions";
import { EChart } from "./EChart";
import {
  AlertIcon,
  ChartIcon,
  DownloadIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  StopIcon,
} from "./Icons";
import { useFixedHorizonExam } from "./useFixedHorizonExam";

const DEFAULT_CONFIG: FixedHorizonExamConfig = {
  modelIds: ["M1"],
  strategyIds: [...DEFAULT_FIXED_HORIZON_STRATEGY_IDS],
  episodesPerCombination: 100_000,
  batchSize: 10_000,
  masterSeed: "MIHAI-EXAM-2026",
  horizon: FIXED_EXAM_HORIZON,
  checkpointStart: FIXED_EXAM_CHECKPOINT_START,
  maxResets: FIXED_EXAM_MAX_RESETS,
};

const PHASE_LABELS: Record<ExamPhase, string> = {
  idle: "待运行",
  starting: "正在准备",
  running: "考试中",
  paused: "已暂停",
  stopping: "正在停止",
  stopped: "已停止",
  completed: "已完成",
  error: "发生错误",
};

const SCORE_METRICS: Array<{ value: ExamScoreMetric; label: string }> = [
  { value: "mean", label: "平均碎片" },
  { value: "variance", label: "碎片方差" },
  { value: "pass", label: "达到600概率" },
  { value: "efficiency", label: "碎片/操作" },
  { value: "marginal", label: "边际碎片" },
];

const STRATEGY_GROUPS = [
  { id: "threshold", label: "阈值核心" },
  { id: "single", label: "单碎片基线" },
  { id: "all", label: "AND基线" },
  { id: "any", label: "OR基线" },
  { id: "baseline", label: "全开基线" },
] as const;

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDecimal(
  value: number | null | undefined,
  digits = 2,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits);
}

function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(digits)}%`;
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}时${minutes}分`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
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
  actions?: ReactNode;
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

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="chart-empty" role="status">
      <ChartIcon />
      <strong>等待真实考试数据</strong>
      <span>{message}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function strategyCode(strategyId: string): string {
  return FIXED_HORIZON_EXAM_STRATEGY_BY_ID.get(
    strategyId as FixedHorizonCoreStrategyId,
  )?.code ?? strategyId;
}

function pointAt(
  points: readonly ExamCurvePoint[],
  operations: number,
): ExamCurvePoint | undefined {
  return points.find((point) => point.operations === operations);
}

export interface ExamPanelProps {
  className?: string;
}

export function ExamPanel({ className = "" }: ExamPanelProps) {
  const controller = useFixedHorizonExam();
  const [config, setConfig] =
    useState<FixedHorizonExamConfig>(DEFAULT_CONFIG);
  const [activeModel, setActiveModel] = useState<ModelId>("M1");
  const [scoreMetric, setScoreMetric] =
    useState<ExamScoreMetric>("mean");
  const [focusedStrategyId, setFocusedStrategyId] = useState(
    "optimized_threshold_v1",
  );
  const [checkpointOperation, setCheckpointOperation] = useState(
    FIXED_EXAM_HORIZON,
  );

  const { snapshot, phase } = controller;
  const configurationLocked =
    phase === "starting" ||
    phase === "running" ||
    phase === "paused" ||
    phase === "stopping";
  const canStart =
    controller.isReady &&
    !configurationLocked &&
    config.modelIds.length > 0 &&
    config.strategyIds.length > 0 &&
    config.episodesPerCombination > 0 &&
    config.batchSize > 0 &&
    config.masterSeed.trim().length > 0;
  const hasResults = (snapshot?.series.length ?? 0) > 0;
  const resultModels = snapshot?.config.modelIds ?? config.modelIds;
  const resultStrategyIds =
    snapshot?.config.strategyIds ?? config.strategyIds;

  useEffect(() => {
    if (!resultModels.includes(activeModel)) {
      setActiveModel(resultModels[0] ?? "M1");
    }
  }, [activeModel, resultModels]);

  useEffect(() => {
    if (!resultStrategyIds.includes(focusedStrategyId)) {
      setFocusedStrategyId(
        resultStrategyIds[0] ?? "optimized_threshold_v1",
      );
    }
  }, [focusedStrategyId, resultStrategyIds]);

  const activeSeries = useMemo(
    () =>
      snapshot?.series.filter((series) => series.modelId === activeModel) ??
      [],
    [activeModel, snapshot],
  );
  const focusedSeries = activeSeries.find(
    (series) => series.strategyId === focusedStrategyId,
  );
  const focusedCells = useMemo(
    () =>
      snapshot?.conditionalResetCells.filter(
        (cell) =>
          cell.modelId === activeModel &&
          cell.strategyId === focusedStrategyId,
      ) ?? [],
    [activeModel, focusedStrategyId, snapshot],
  );
  const activePairs = useMemo(
    () =>
      snapshot?.pairedSeries.filter(
        (series) => series.modelId === activeModel,
      ) ?? [],
    [activeModel, snapshot],
  );
  const tableRows = useMemo(
    () =>
      activeSeries.flatMap((series) => {
        const point = pointAt(series.points, checkpointOperation);
        return point ? [{ series, point }] : [];
      }),
    [activeSeries, checkpointOperation],
  );
  const focusedPoint = focusedSeries
    ? pointAt(focusedSeries.points, checkpointOperation)
    : undefined;

  const scoreOption = useMemo(
    () => examScoreCurveOption(activeSeries, scoreMetric),
    [activeSeries, scoreMetric],
  );
  const resetOption = useMemo(
    () => examResetCurveOption(activeSeries),
    [activeSeries],
  );
  const conditionalOption = useMemo(
    () =>
      examConditionalHeatmapOption(
        focusedCells,
        focusedSeries?.strategyName ??
          strategyCode(focusedStrategyId),
      ),
    [focusedCells, focusedSeries?.strategyName, focusedStrategyId],
  );
  const pairedOption = useMemo(
    () => examPairedDifferenceOption(activePairs),
    [activePairs],
  );

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

  const start = () => {
    controller.start({
      ...config,
      horizon: FIXED_EXAM_HORIZON,
      checkpointStart: FIXED_EXAM_CHECKPOINT_START,
      maxResets: FIXED_EXAM_MAX_RESETS,
      modelIds: [...new Set(config.modelIds)],
      strategyIds: [...new Set(config.strategyIds)],
    });
  };

  const progress = snapshot?.progress;
  const plannedEpisodes =
    config.modelIds.length *
    config.strategyIds.length *
    config.episodesPerCombination;
  const completedEpisodes = progress?.completedEpisodes ?? 0;
  const totalEpisodes = progress?.totalEpisodes ?? plannedEpisodes;
  const progressRate = progress?.progress ?? 0;

  return (
    <section
      className={className}
      data-testid="fixed-horizon-exam"
      data-exam-phase={phase}
      aria-label="80至180次操作定长考试"
      style={{ display: "grid", gap: 16 }}
    >
      <article className="data-card">
        <CardHeading
          eyebrow="FIXED-HORIZON EXAM"
          title="定长考试配置"
          description="每局统一执行到180次操作，在80–180的每个整数点记录碎片成绩、重置轨迹和配对差值；600只是一条评分线，不会提前终止。"
          actions={
            <span className="row-count">{PHASE_LABELS[phase]}</span>
          }
        />

        <div
          className="assumption-note"
          style={{ marginTop: 4, paddingBottom: 12 }}
        >
          <InfoIcon />
          <p>
            <strong>核心等价关系</strong>
            S02 = S01核心：移除依赖600目标的150硬上限；S16 =
            S05核心。两组包装器不会重复计分，导出文件会保留别名说明。
          </p>
        </div>

        <fieldset disabled={configurationLocked}>
          <legend>抽奖假设模型</legend>
          <p className="field-hint">
            至少选择一个；模型是假设口径，不代表游戏公司的内部算法。
          </p>
          <div
            className="option-stack"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            {MODEL_IDS.map((modelId) => {
              const model = MODEL_DEFINITIONS[modelId];
              const selected = config.modelIds.includes(modelId);
              return (
                <label
                  key={modelId}
                  className={`choice-card ${selected ? "is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleModel(modelId)}
                  />
                  <span className="choice-check" aria-hidden="true" />
                  <span>
                    <strong>{model.name}</strong>
                    <small>{model.shortDescription}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={configurationLocked}>
          <legend>考试策略核心</legend>
          <p className="field-hint">
            已选 {config.strategyIds.length} /{" "}
            {FIXED_HORIZON_EXAM_STRATEGIES.length}条。默认比较S01核心、S05、S03和全开；
            配对差默认以S05为基线，未选S05时依次退回全开或首项。
          </p>
          <div
            className="run-actions"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(130px, 1fr))",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              className="button button-subtle"
              onClick={() =>
                setConfig((current) => ({
                  ...current,
                  strategyIds: [...DEFAULT_FIXED_HORIZON_STRATEGY_IDS],
                }))
              }
            >
              恢复考试四项
            </button>
            <button
              type="button"
              className="button button-subtle"
              onClick={() =>
                setConfig((current) => ({
                  ...current,
                  strategyIds: FIXED_HORIZON_EXAM_STRATEGIES.map(
                    (strategy) => strategy.id,
                  ),
                }))
              }
            >
              全选核心
            </button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {STRATEGY_GROUPS.map((group) => {
              const options = FIXED_HORIZON_EXAM_STRATEGIES.filter(
                (strategy) => strategy.group === group.id,
              );
              if (options.length === 0) return null;
              return (
                <div key={group.id}>
                  <p className="field-hint" style={{ marginBottom: 5 }}>
                    {group.label} · {options.length}条
                  </p>
                  <div
                    className="option-stack"
                    style={{
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(210px, 1fr))",
                    }}
                  >
                    {options.map((strategy) => {
                      const selected = config.strategyIds.includes(
                        strategy.id,
                      );
                      return (
                        <label
                          key={strategy.id}
                          className={`choice-card ${selected ? "is-selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleStrategy(strategy.id)}
                          />
                          <span
                            className="choice-check"
                            aria-hidden="true"
                          />
                          <span>
                            <strong>
                              {strategy.code} · {strategy.name}
                            </strong>
                            <small>{strategy.description}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset
          className="parameter-grid"
          disabled={configurationLocked}
        >
          <legend>运行规模</legend>
          <label>
            <span>考试区间</span>
            <input
              type="text"
              readOnly
              value={`${FIXED_EXAM_CHECKPOINT_START}–${FIXED_EXAM_HORIZON}次`}
              aria-label="固定考试操作区间"
            />
          </label>
          <label>
            <span>最多重置</span>
            <input
              type="text"
              readOnly
              value={`${FIXED_EXAM_MAX_RESETS}次`}
              aria-label="固定最大重置次数"
            />
          </label>
          <label>
            <span>每组合局数</span>
            <select
              value={config.episodesPerCombination}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  episodesPerCombination: Number(event.target.value),
                }))
              }
            >
              <option value={10_000}>10,000 · 冒烟检查</option>
              <option value={100_000}>100,000 · 默认</option>
              <option value={500_000}>500,000</option>
              <option value={1_000_000}>1,000,000 · 正式量级</option>
            </select>
          </label>
          <label>
            <span>实时更新批次</span>
            <select
              value={config.batchSize}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  batchSize: Number(event.target.value),
                }))
              }
            >
              <option value={1_000}>每1,000局</option>
              <option value={5_000}>每5,000局</option>
              <option value={10_000}>每10,000局</option>
              <option value={50_000}>每50,000局</option>
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

        <p className="field-hint">
          当前计划共处理 {formatInteger(plannedEpisodes)}
          个模型×策略episode；定长考试每局固定执行180次，明显重于达标赛。
        </p>

        <div className="run-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={!canStart}
            onClick={start}
          >
            <PlayIcon />
            开始考试
          </button>
          {phase === "paused" ? (
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
              disabled={phase !== "running"}
              onClick={controller.pause}
            >
              <PauseIcon />
              暂停
            </button>
          )}
          <button
            type="button"
            className="button"
            disabled={
              phase !== "starting" &&
              phase !== "running" &&
              phase !== "paused"
            }
            onClick={controller.stop}
          >
            <StopIcon />
            停止
          </button>
          <button
            type="button"
            className="button button-subtle"
            disabled={phase === "stopping"}
            onClick={controller.reset}
          >
            <ResetIcon />
            清空结果
          </button>
        </div>

        <div className="export-block">
          <span>真实聚合数据导出</span>
          <div>
            <button
              type="button"
              className="button button-export"
              disabled={!hasResults}
              onClick={() => controller.exportRun("zip")}
            >
              <DownloadIcon />
              全部ZIP
            </button>
            <button
              type="button"
              className="button button-icon"
              disabled={!hasResults}
              onClick={() => controller.exportRun("json")}
              aria-label="导出考试JSON"
              title="导出JSON"
            >
              JSON
            </button>
            <button
              type="button"
              className="button button-icon"
              disabled={!hasResults}
              onClick={() => controller.exportRun("csv")}
              aria-label="导出考试曲线CSV"
              title="导出CSV"
            >
              CSV
            </button>
          </div>
        </div>
      </article>

      {controller.notice ? (
        <div
          className={`notice notice-${controller.notice.kind}`}
          role={controller.notice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span>{controller.notice.message}</span>
          <button
            type="button"
            onClick={controller.clearNotice}
            aria-label="关闭考试提示"
          >
            ×
          </button>
        </div>
      ) : null}

      <section className="run-overview" aria-label="定长考试进度">
        <div className="progress-copy">
          <div className="section-label-row">
            <div>
              <span className="eyebrow">LIVE EXAM</span>
              <h2>考试进度</h2>
            </div>
            <strong>{formatPercent(progressRate, 1)}</strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="定长考试完成进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressRate * 100)}
          >
            <span
              style={{ width: `${Math.min(100, progressRate * 100)}%` }}
            />
          </div>
          <div className="progress-foot">
            <span>
              {formatInteger(completedEpisodes)}
              <small> / {formatInteger(totalEpisodes)} episode</small>
            </span>
            <span>{PHASE_LABELS[phase]}</span>
          </div>
        </div>
        <div className="live-facts">
          <div>
            <span>实时速度</span>
            <strong>
              {progress?.episodesPerSecond
                ? formatCompact(progress.episodesPerSecond)
                : "—"}
              <small> episode/秒</small>
            </strong>
          </div>
          <div>
            <span>已运行</span>
            <strong>{formatDuration(progress?.elapsedMs ?? 0)}</strong>
          </div>
          <div>
            <span>预计剩余</span>
            <strong>
              {formatDuration(progress?.estimatedRemainingMs ?? null)}
            </strong>
          </div>
          <div>
            <span>已完成批次</span>
            <strong>
              {progress?.completedBatches ?? 0}
              <small> / {progress?.totalBatches ?? "—"}</small>
            </strong>
          </div>
        </div>
      </section>

      <nav className="model-switcher" aria-label="查看考试模型">
        <span>查看模型</span>
        {resultModels.map((modelId) => (
          <button
            key={modelId}
            type="button"
            className={activeModel === modelId ? "is-active" : ""}
            aria-current={activeModel === modelId ? "true" : undefined}
            onClick={() => setActiveModel(modelId)}
          >
            {modelId}
          </button>
        ))}
        <small>{MODEL_DEFINITIONS[activeModel].shortDescription}</small>
      </nav>

      <section className="chart-grid" aria-label="定长考试图表">
        <article className="data-card">
          <CardHeading
            eyebrow="SCORE CURVE"
            title="操作次数 × 考试成绩"
            description="切换平均数、方差、达到600概率、单位效率和新增一次操作的边际收益；平均碎片模式的淡色带为P05–P95。"
            actions={
              <label>
                <span className="sr-only">成绩指标</span>
                <select
                  aria-label="成绩曲线指标"
                  value={scoreMetric}
                  onChange={(event) =>
                    setScoreMetric(
                      event.target.value as ExamScoreMetric,
                    )
                  }
                >
                  {SCORE_METRICS.map((metric) => (
                    <option key={metric.value} value={metric.value}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
          {activeSeries.length ? (
            <EChart
              className="chart-standard"
              option={scoreOption}
              ariaLabel={`${activeModel}各策略80至180次操作的${SCORE_METRICS.find((metric) => metric.value === scoreMetric)?.label ?? "成绩"}曲线`}
            />
          ) : (
            <EmptyChart message="开始考试后，每个批次将用真实聚合结果重绘成绩曲线。" />
          )}
        </article>

        <article className="data-card">
          <CardHeading
            eyebrow="RESET TRAJECTORY"
            title="累计重置轨迹"
            description="实线为截至操作N的平均重置次数，虚线为重置次数P95；它显示策略如何消耗13次重置额度。"
          />
          {activeSeries.length ? (
            <EChart
              className="chart-standard"
              option={resetOption}
              ariaLabel={`${activeModel}各策略80至180次操作的平均重置和P95曲线`}
            />
          ) : (
            <EmptyChart message="这里不会展示预计算或伪造的重置轨迹。" />
          )}
        </article>

        <article className="data-card">
          <CardHeading
            eyebrow="CONDITIONAL DETAIL"
            title="操作次数 × 已用重置"
            description="颜色为聚焦策略在该操作点和重置层中的条件平均碎片；悬停同时查看方差、样本数和该层概率。"
            actions={
              <label>
                <span className="sr-only">聚焦策略</span>
                <select
                  aria-label="条件热力图聚焦策略"
                  value={focusedStrategyId}
                  onChange={(event) =>
                    setFocusedStrategyId(event.target.value)
                  }
                >
                  {resultStrategyIds.map((strategyId) => {
                    const series = activeSeries.find(
                      (item) => item.strategyId === strategyId,
                    );
                    const option =
                      FIXED_HORIZON_EXAM_STRATEGY_BY_ID.get(
                        strategyId as FixedHorizonCoreStrategyId,
                      );
                    return (
                      <option key={strategyId} value={strategyId}>
                        {option?.code ?? strategyId} ·{" "}
                        {series?.strategyName ?? option?.name ?? strategyId}
                      </option>
                    );
                  })}
                </select>
              </label>
            }
          />
          {focusedCells.length ? (
            <EChart
              className="chart-standard"
              option={conditionalOption}
              ariaLabel={`${activeModel}${focusedSeries?.strategyName ?? focusedStrategyId}按操作次数和重置次数分组的条件平均碎片热力图`}
            />
          ) : (
            <EmptyChart message="选择策略并完成首个批次后显示条件统计；它是观察性分组，不代表因果收益。" />
          )}
        </article>

        <article className="data-card">
          <CardHeading
            eyebrow="PAIRED DIFFERENCE"
            title="同地图配对碎片差"
            description="候选碎片−基线碎片，正数表示候选更好，淡色带为均值的95%置信区间；所有策略复用相同episode和地图序列。"
          />
          {activePairs.length ? (
            <EChart
              className="chart-standard"
              option={pairedOption}
              ariaLabel={`${activeModel}各候选策略相对基线的平均碎片差曲线`}
            />
          ) : (
            <EmptyChart message="至少选择两个策略并完成首个批次后显示配对差；单策略考试没有配对曲线。" />
          )}
        </article>
      </section>

      <section
        className="data-card table-card"
        aria-labelledby="exam-checkpoint-title"
      >
        <CardHeading
          eyebrow="CHECKPOINT TABLE"
          title="关键N完整成绩表"
          description="拖动操作次数索引，逐项查看同一时点的均值、方差、分位数、及格率、重置消耗和三类碎片取得数。"
          actions={
            <span className="row-count">
              N = {checkpointOperation}
            </span>
          }
        />
        <div style={{ padding: "0 18px 12px" }}>
          <label>
            <span className="sr-only">关键操作次数</span>
            <input
              type="range"
              min={FIXED_EXAM_CHECKPOINT_START}
              max={FIXED_EXAM_HORIZON}
              step={1}
              value={checkpointOperation}
              onChange={(event) =>
                setCheckpointOperation(Number(event.target.value))
              }
              aria-label="关键操作次数"
            />
          </label>
          {focusedPoint ? (
            <div className="metric-grid">
              <Metric
                label={`${focusedSeries?.strategyName ?? focusedStrategyId}平均碎片`}
                value={formatDecimal(focusedPoint.meanFragments, 3)}
                detail={`95% CI ${formatDecimal(focusedPoint.ci95LowFragments, 3)}–${formatDecimal(focusedPoint.ci95HighFragments, 3)}`}
              />
              <Metric
                label="达到600概率"
                value={formatPercent(
                  focusedPoint.probabilityAtLeast600,
                  2,
                )}
                detail={`平均缺口 ${formatDecimal(focusedPoint.meanShortfallTo600, 2)}`}
              />
              <Metric
                label="碎片方差 / 标准差"
                value={`${formatDecimal(focusedPoint.varianceFragments, 2)} / ${formatDecimal(focusedPoint.standardDeviationFragments, 2)}`}
              />
              <Metric
                label="平均重置 / P95"
                value={`${formatDecimal(focusedPoint.meanResets, 2)} / ${formatDecimal(focusedPoint.resetP95, 0)}`}
                detail={`护栏命中 ${formatPercent(focusedPoint.probabilityGuardBlocked, 2)} · 碎片/重置相关 ${formatDecimal(focusedPoint.fragmentsResetCorrelation, 3)}`}
              />
            </div>
          ) : null}
        </div>
        {tableRows.length ? (
          <div
            className="table-scroll"
            tabIndex={0}
            aria-label={`操作${checkpointOperation}次时的考试完整统计`}
          >
            <table>
              <thead>
                <tr>
                  <th
                    className="sticky-col sticky-col-first"
                    scope="col"
                  >
                    模型
                  </th>
                  <th
                    className="sticky-col sticky-col-second"
                    scope="col"
                  >
                    策略核心
                  </th>
                  <th scope="col">样本</th>
                  <th scope="col">碎片均值</th>
                  <th scope="col">方差</th>
                  <th scope="col">标准差</th>
                  <th scope="col">变异系数</th>
                  <th scope="col">偏度</th>
                  <th scope="col">超额峰度</th>
                  <th scope="col">均值95% CI</th>
                  <th scope="col">最小</th>
                  <th scope="col">P05</th>
                  <th scope="col">P25</th>
                  <th scope="col">P50</th>
                  <th scope="col">P75</th>
                  <th scope="col">P90</th>
                  <th scope="col">P95</th>
                  <th scope="col">P99</th>
                  <th scope="col">最大</th>
                  <th scope="col">≥600</th>
                  <th scope="col">平均缺口</th>
                  <th scope="col">平均超额</th>
                  <th scope="col">平均奖励碎片</th>
                  <th scope="col">碎片/操作</th>
                  <th scope="col">边际碎片</th>
                  <th scope="col">平均重置</th>
                  <th scope="col">重置方差</th>
                  <th scope="col">重置最小</th>
                  <th scope="col">重置P05</th>
                  <th scope="col">重置P25</th>
                  <th scope="col">重置P50</th>
                  <th scope="col">重置P75</th>
                  <th scope="col">重置P95</th>
                  <th scope="col">重置最大</th>
                  <th scope="col">从不重置</th>
                  <th scope="col">用尽13次</th>
                  <th scope="col">平均策略重置</th>
                  <th scope="col">平均图尽重置</th>
                  <th scope="col">平均请求重置</th>
                  <th scope="col">平均地图</th>
                  <th scope="col">当前图平均深度</th>
                  <th scope="col">护栏阻止</th>
                  <th scope="col">护栏命中率</th>
                  <th scope="col">碎片/重置相关</th>
                  <th scope="col">5取得数</th>
                  <th scope="col">15取得数</th>
                  <th scope="col">30取得数</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ series, point }) => (
                  <tr key={series.key}>
                    <th
                      className="sticky-col sticky-col-first"
                      scope="row"
                    >
                      <span className="model-badge">{series.modelId}</span>
                    </th>
                    <th
                      className="sticky-col sticky-col-second"
                      scope="row"
                    >
                      <span
                        className="table-strategy-dot"
                        style={
                          {
                            "--strategy-color": series.color,
                          } as CSSProperties
                        }
                      />
                      {strategyCode(series.strategyId)} ·{" "}
                      {series.strategyName}
                    </th>
                    <td>{formatInteger(point.episodes)}</td>
                    <td className="cell-emphasis">
                      {formatDecimal(point.meanFragments, 3)}
                    </td>
                    <td>{formatDecimal(point.varianceFragments, 2)}</td>
                    <td>
                      {formatDecimal(
                        point.standardDeviationFragments,
                        2,
                      )}
                    </td>
                    <td>
                      {formatDecimal(
                        point.coefficientOfVariationFragments,
                        4,
                      )}
                    </td>
                    <td>{formatDecimal(point.skewnessFragments, 3)}</td>
                    <td>
                      {formatDecimal(point.kurtosisExcessFragments, 3)}
                    </td>
                    <td>
                      {formatDecimal(point.ci95LowFragments, 3)}–
                      {formatDecimal(point.ci95HighFragments, 3)}
                    </td>
                    <td>{point.minimumFragments}</td>
                    <td>{point.quantiles.p05}</td>
                    <td>{point.quantiles.p25}</td>
                    <td>{point.quantiles.p50}</td>
                    <td>{point.quantiles.p75}</td>
                    <td>{point.quantiles.p90}</td>
                    <td>{point.quantiles.p95}</td>
                    <td>{point.quantiles.p99}</td>
                    <td>{point.maximumFragments}</td>
                    <td className="cell-emphasis">
                      {formatPercent(point.probabilityAtLeast600, 2)}
                    </td>
                    <td>{formatDecimal(point.meanShortfallTo600, 2)}</td>
                    <td>{formatDecimal(point.meanOverflowAbove600, 2)}</td>
                    <td>{formatDecimal(point.meanBonusFragments, 3)}</td>
                    <td>{formatDecimal(point.fragmentsPerOperation, 4)}</td>
                    <td>
                      {formatDecimal(point.marginalMeanFragments, 3)}
                    </td>
                    <td>{formatDecimal(point.meanResets, 3)}</td>
                    <td>{formatDecimal(point.varianceResets, 3)}</td>
                    <td>{point.minimumResets}</td>
                    <td>{point.resetP05}</td>
                    <td>{point.resetP25}</td>
                    <td>{point.resetP50}</td>
                    <td>{point.resetP75}</td>
                    <td>{point.resetP95}</td>
                    <td>{point.maximumResets}</td>
                    <td>
                      {formatPercent(
                        point.probabilityNoResetsUsed,
                        2,
                      )}
                    </td>
                    <td>
                      {formatPercent(
                        point.probabilityAllResetsUsed,
                        2,
                      )}
                    </td>
                    <td>
                      {formatDecimal(point.meanStrategicResets, 3)}
                    </td>
                    <td>
                      {formatDecimal(
                        point.meanMapExhaustionResets,
                        3,
                      )}
                    </td>
                    <td>
                      {formatDecimal(point.meanResetRequests, 3)}
                    </td>
                    <td>{formatDecimal(point.meanMaps, 3)}</td>
                    <td>
                      {formatDecimal(point.meanCurrentMapDepth, 3)}
                    </td>
                    <td>
                      {formatDecimal(point.meanGuardBlockedResets, 3)}
                    </td>
                    <td>
                      {formatPercent(point.probabilityGuardBlocked, 2)}
                    </td>
                    <td>
                      {formatDecimal(point.fragmentsResetCorrelation, 3)}
                    </td>
                    <td>{formatDecimal(point.meanFragment5Awards, 3)}</td>
                    <td>
                      {formatDecimal(point.meanFragment15Awards, 3)}
                    </td>
                    <td>
                      {formatDecimal(point.meanFragment30Awards, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "0 18px 18px" }}>
            <EmptyChart message="首个真实批次完成后，表格会同时出现80–180全部可选检查点。" />
          </div>
        )}
      </section>

      <article className="data-card">
        <CardHeading
          eyebrow="INTERPRETATION"
          title="结果边界与别名"
          description="这些说明随页面保留，避免把目标无关核心成绩误读成S02/S16原本的600达标保障。"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 10,
          }}
        >
          {FIXED_HORIZON_WRAPPER_ALIASES.map((alias) => {
            const core =
              FIXED_HORIZON_EXAM_STRATEGY_BY_ID.get(alias.coreId);
            return (
              <div className="guardrail" key={alias.wrapperId}>
                <div>
                  <strong>
                    {alias.wrapperCode} = {core?.code ?? alias.coreId}核心
                  </strong>
                  <code>
                    {alias.wrapperId} → {alias.coreId}
                  </code>
                </div>
                <p>{alias.explanation}</p>
              </div>
            );
          })}
        </div>
        <div className="assumption-note">
          <AlertIcon />
          <p>
            <strong>不能单独据此作因果结论</strong>
            条件热力图中的“重置R次时平均碎片”同时受策略选择与随机路径影响；
            定长考试应与原600碎片达标赛共同阅读，而不是替代它。
          </p>
        </div>
        <div className="assumption-note">
          <InfoIcon />
          <p>
            <strong>150次结构性保底</strong>
            全开固定得到600；“集齐5、15、30后重置”也不会低于600，
            因为150次基础碎片为300，覆盖的每个25格容量段都已取得50奖励碎片。
            S01/S05考试核心没有这项硬保证。
          </p>
        </div>
        {snapshot?.warnings.length ? (
          <ul
            style={{
              margin: "10px 0 0",
              paddingLeft: 20,
              color: "#8298a6",
              fontSize: 10,
              lineHeight: 1.65,
            }}
          >
            {snapshot.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </article>
    </section>
  );
}

export default ExamPanel;
