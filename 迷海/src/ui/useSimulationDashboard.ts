import { useCallback, useEffect, useRef, useState } from "react";
import { createDemoSnapshot, DEFAULT_CONFIG } from "./demoData";
import type {
  AggregatedSnapshot,
  RunPhase,
  SimulationConfig,
  SimulationPort,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "./workerTypes";

interface DashboardNotice {
  kind: "info" | "success" | "error";
  message: string;
}

export interface SimulationDashboardController {
  snapshot: AggregatedSnapshot;
  isDemo: boolean;
  notice: DashboardNotice | null;
  clearNotice: () => void;
  start: (config: SimulationConfig) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  exportRun: (format: "zip" | "json" | "csv") => void;
}

function requestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadPayload(
  filename: string,
  mimeType: string,
  payload: Uint8Array | string,
) {
  const blob = new Blob([payload as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function withPhase(snapshot: AggregatedSnapshot, phase: RunPhase) {
  return {
    ...snapshot,
    phase,
    progress: {
      ...snapshot.progress,
      activeWorkers: phase === "running" ? snapshot.config.workerCount : 0,
    },
  };
}

export function useSimulationDashboard(
  simulationPort?: SimulationPort,
): SimulationDashboardController {
  const isDemo = simulationPort === undefined;
  const [snapshot, setSnapshot] = useState(() => {
    const combinations =
      DEFAULT_CONFIG.modelIds.length * DEFAULT_CONFIG.strategyIds.length;
    return createDemoSnapshot(
      DEFAULT_CONFIG,
      DEFAULT_CONFIG.batchSize * combinations * 4,
      "idle",
    );
  });
  const [notice, setNotice] = useState<DashboardNotice | null>(null);
  const sequenceRef = useRef(0);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!simulationPort) {
      return;
    }
    return simulationPort.subscribe((message: WorkerToUiMessage) => {
      if (message.type === "snapshot" || message.type === "complete") {
        setSnapshot(message.snapshot);
        if (message.type === "complete") {
          setNotice({ kind: "success", message: "模拟已完成，最终快照已锁定。" });
        }
        return;
      }
      if (message.type === "status") {
        setSnapshot((current) => withPhase(current, message.phase));
        if (message.message) {
          setNotice({ kind: "info", message: message.message });
        }
        return;
      }
      if (message.type === "export-ready") {
        downloadPayload(message.filename, message.mimeType, message.payload);
        setNotice({ kind: "success", message: `已生成 ${message.filename}` });
        return;
      }
      if (message.type === "error") {
        setSnapshot((current) => withPhase(current, "error"));
        setNotice({
          kind: "error",
          message: `${message.message}${message.recoverable ? "（可重试）" : ""}`,
        });
      }
    });
  }, [simulationPort]);

  useEffect(() => {
    if (!isDemo || snapshot.phase !== "running") {
      return;
    }
    const timer = window.setInterval(() => {
      setSnapshot((current) => {
        if (current.phase !== "running") {
          return current;
        }
        const combinations = Math.max(
          1,
          current.config.modelIds.length * current.config.strategyIds.length,
        );
        const increment = current.config.batchSize * combinations;
        const nextCompleted = Math.min(
          current.progress.totalEpisodes,
          current.progress.completedEpisodes + increment,
        );
        sequenceRef.current += 1;
        return createDemoSnapshot(
          current.config,
          nextCompleted,
          nextCompleted >= current.progress.totalEpisodes ? "completed" : "running",
          sequenceRef.current,
        );
      });
    }, 560);
    return () => window.clearInterval(timer);
  }, [isDemo, snapshot.phase]);

  const send = useCallback(
    (message: UiToWorkerMessage) => {
      simulationPort?.postMessage(message);
    },
    [simulationPort],
  );

  const start = useCallback(
    (config: SimulationConfig) => {
      setNotice(null);
      if (!isDemo) {
        send({ type: "start", requestId: requestId(), config });
        setSnapshot((current) => ({
          ...current,
          phase: "starting",
          config,
        }));
        return;
      }
      sequenceRef.current = 0;
      setSnapshot(createDemoSnapshot(config, 0, "running", 0));
      setNotice({
        kind: "info",
        message: "正在运行界面演示。接入真实 Worker 后，这里将展示正式聚合快照。",
      });
    },
    [isDemo, send],
  );

  const pause = useCallback(() => {
    const current = snapshotRef.current;
    if (!isDemo) {
      send({
        type: "pause",
        requestId: requestId(),
        runId: current.runId,
      });
      setSnapshot((value) => withPhase(value, "pausing"));
      return;
    }
    setSnapshot((value) => withPhase(value, "paused"));
  }, [isDemo, send]);

  const resume = useCallback(() => {
    const current = snapshotRef.current;
    if (!isDemo) {
      send({
        type: "resume",
        requestId: requestId(),
        runId: current.runId,
      });
      return;
    }
    setSnapshot((value) => withPhase(value, "running"));
  }, [isDemo, send]);

  const stop = useCallback(() => {
    const current = snapshotRef.current;
    if (!isDemo) {
      send({
        type: "stop",
        requestId: requestId(),
        runId: current.runId,
      });
      setSnapshot((value) => withPhase(value, "stopping"));
      return;
    }
    setSnapshot((value) => withPhase(value, "stopped"));
    setNotice({ kind: "info", message: "演示运行已停止，当前快照已保留。" });
  }, [isDemo, send]);

  const reset = useCallback(() => {
    if (!isDemo) {
      send({ type: "reset", requestId: requestId() });
    }
    sequenceRef.current = 0;
    const config = snapshotRef.current.config;
    const combinations = Math.max(1, config.modelIds.length * config.strategyIds.length);
    setSnapshot(
      createDemoSnapshot(
        config,
        isDemo ? config.batchSize * combinations * 4 : 0,
        "idle",
        0,
      ),
    );
    setNotice(null);
  }, [isDemo, send]);

  const exportRun = useCallback(
    (format: "zip" | "json" | "csv") => {
      const current = snapshotRef.current;
      if (!isDemo) {
        send({
          type: "export",
          requestId: requestId(),
          runId: current.runId,
          format,
        });
        setNotice({ kind: "info", message: "正在整理导出文件……" });
        return;
      }
      const payload = JSON.stringify(
        {
          warning: "界面演示数据，不可用于正式决策",
          snapshot: current,
        },
        null,
        2,
      );
      downloadPayload(
        `mihai-demo-preview-${Date.now()}.json`,
        "application/json;charset=utf-8",
        payload,
      );
      setNotice({ kind: "success", message: "已导出带演示标记的界面预览 JSON。" });
    },
    [isDemo, send],
  );

  return {
    snapshot,
    isDemo,
    notice,
    clearNotice: () => setNotice(null),
    start,
    pause,
    resume,
    stop,
    reset,
    exportRun,
  };
}
