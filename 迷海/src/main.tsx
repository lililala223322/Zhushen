import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { createWorkerPort } from "./ui/workerTypes";

document.documentElement.lang = "zh-CN";
document.title = "迷海寻宝 · 策略实验室";

const root = document.getElementById("root");

if (!root) {
  throw new Error("找不到应用挂载节点 #root");
}

const simulationWorker = new Worker(
  new URL("./workers/simulation.worker.ts", import.meta.url),
  {
    type: "module",
    name: "mihai-simulation",
  },
);
const simulationPort = createWorkerPort(simulationWorker);

window.addEventListener("beforeunload", () => {
  simulationPort.terminate?.();
});

createRoot(root).render(
  <StrictMode>
    <App simulationPort={simulationPort} />
  </StrictMode>,
);
