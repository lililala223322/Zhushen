import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExamPhase,
  ExamUiToWorkerMessage,
  ExamWorkerToUiMessage,
  FixedHorizonExamConfig,
  FixedHorizonExamSnapshot,
} from "../exam/types";

export interface FixedHorizonExamNotice {
  kind: "info" | "success" | "error";
  message: string;
}

export interface FixedHorizonExamController {
  snapshot: FixedHorizonExamSnapshot | null;
  phase: ExamPhase;
  isReady: boolean;
  notice: FixedHorizonExamNotice | null;
  clearNotice: () => void;
  start: (config: FixedHorizonExamConfig) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  exportRun: (format: "json" | "csv" | "zip") => void;
}

function requestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `exam-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadPayload(
  filename: string,
  mimeType: string,
  payload: Uint8Array | string,
): void {
  let body: BlobPart = payload as BlobPart;
  if (mimeType === "application/zip" && typeof payload === "string") {
    const bytes = new Uint8Array(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      bytes[index] = payload.charCodeAt(index) & 0xff;
    }
    body = bytes;
  }
  const blob = new Blob([body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function isActivePhase(phase: ExamPhase): boolean {
  return (
    phase === "starting" ||
    phase === "running" ||
    phase === "paused" ||
    phase === "stopping"
  );
}

export function useFixedHorizonExam(): FixedHorizonExamController {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef<string | null>(null);
  const phaseRef = useRef<ExamPhase>("idle");
  const resetPendingRef = useRef(false);
  const [snapshot, setSnapshot] =
    useState<FixedHorizonExamSnapshot | null>(null);
  const [phase, setPhaseState] = useState<ExamPhase>("idle");
  const [isReady, setIsReady] = useState(false);
  const [notice, setNotice] = useState<FixedHorizonExamNotice | null>(null);

  const setPhase = useCallback((next: ExamPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/exam.worker.ts", import.meta.url),
      {
        type: "module",
        name: "mihai-fixed-horizon-exam",
      },
    );
    workerRef.current = worker;
    setIsReady(true);

    const handleMessage = (
      event: MessageEvent<ExamWorkerToUiMessage>,
    ): void => {
      const message = event.data;
      if (message.type === "status") {
        runIdRef.current = message.runId;
        if (resetPendingRef.current && message.phase === "stopped") {
          resetPendingRef.current = false;
          runIdRef.current = null;
          setPhase("idle");
          setNotice(null);
          return;
        }
        setPhase(message.phase);
        if (message.message) {
          setNotice({ kind: "info", message: message.message });
        }
        return;
      }
      if (message.type === "snapshot" || message.type === "complete") {
        runIdRef.current = message.snapshot.runId;
        setSnapshot(message.snapshot);
        setPhase(message.snapshot.phase);
        if (message.type === "complete") {
          setNotice({
            kind: "success",
            message: "定长考试已完成，80–180次操作的最终成绩已锁定。",
          });
        } else if (message.snapshot.phase === "stopped") {
          setNotice({
            kind: "info",
            message: "定长考试已停止，当前部分样本已保留并可导出。",
          });
        }
        return;
      }
      if (message.type === "export-ready") {
        downloadPayload(
          message.filename,
          message.mimeType,
          message.payload,
        );
        setNotice({
          kind: "success",
          message: `已生成 ${message.filename}`,
        });
        return;
      }
      if (message.type === "error") {
        setPhase("error");
        setNotice({
          kind: "error",
          message: `${message.message}${message.recoverable ? "（可重试）" : ""}`,
        });
      }
    };

    const handleWorkerError = (event: ErrorEvent): void => {
      setPhase("error");
      setNotice({
        kind: "error",
        message: event.message || "定长考试Worker发生未知错误。",
      });
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, [setPhase]);

  const post = useCallback((message: ExamUiToWorkerMessage): boolean => {
    const worker = workerRef.current;
    if (!worker) {
      setNotice({
        kind: "error",
        message: "定长考试Worker尚未准备完成，请稍后重试。",
      });
      return false;
    }
    worker.postMessage(message);
    return true;
  }, []);

  const start = useCallback(
    (config: FixedHorizonExamConfig) => {
      if (isActivePhase(phaseRef.current)) return;
      const sent = post({
        type: "start",
        requestId: requestId(),
        config,
      });
      if (!sent) return;
      resetPendingRef.current = false;
      runIdRef.current = null;
      setSnapshot(null);
      setNotice({
        kind: "info",
        message: "正在初始化定长考试；首个批次完成后显示真实聚合数据。",
      });
      setPhase("starting");
    },
    [post, setPhase],
  );

  const pause = useCallback(() => {
    const runId = runIdRef.current;
    if (!runId || phaseRef.current !== "running") return;
    post({
      type: "pause",
      requestId: requestId(),
      runId,
    });
  }, [post]);

  const resume = useCallback(() => {
    const runId = runIdRef.current;
    if (!runId || phaseRef.current !== "paused") return;
    post({
      type: "resume",
      requestId: requestId(),
      runId,
    });
  }, [post]);

  const stop = useCallback(() => {
    const runId = runIdRef.current;
    if (!runId || !isActivePhase(phaseRef.current)) return;
    const sent = post({
      type: "stop",
      requestId: requestId(),
      runId,
    });
    if (sent) setPhase("stopping");
  }, [post, setPhase]);

  const reset = useCallback(() => {
    const wasActive = isActivePhase(phaseRef.current);
    if (wasActive) resetPendingRef.current = true;
    post({ type: "reset", requestId: requestId() });
    setSnapshot(null);
    setNotice(null);
    if (wasActive) {
      setPhase("stopping");
    } else {
      runIdRef.current = null;
      resetPendingRef.current = false;
      setPhase("idle");
    }
  }, [post, setPhase]);

  const exportRun = useCallback(
    (format: "json" | "csv" | "zip") => {
      const runId = runIdRef.current ?? snapshot?.runId;
      if (!runId || !snapshot) {
        setNotice({
          kind: "error",
          message: "尚无可导出的定长考试快照。",
        });
        return;
      }
      const sent = post({
        type: "export",
        requestId: requestId(),
        runId,
        format,
      });
      if (sent) {
        setNotice({ kind: "info", message: "正在整理定长考试导出文件……" });
      }
    },
    [post, snapshot],
  );

  return {
    snapshot,
    phase,
    isReady,
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
