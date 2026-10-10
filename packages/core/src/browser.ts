import * as core from "./index";

declare global {
  interface Window {
    ZhushenCore: typeof core;
  }
}

if (typeof window !== "undefined") {
  window.ZhushenCore = core;
}

export * from "./index";
