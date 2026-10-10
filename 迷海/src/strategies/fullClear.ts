import type { Strategy } from "./types";

export const fullClearStrategy: Strategy = Object.freeze({
  id: "full_clear",
  name: "全部打开",
  description: "每张地图完整打开25格，未完成时再进入下一张地图。",
  kind: "full_clear",
  definition: Object.freeze({ type: "full_clear" }),
  decide: () => "open",
});

