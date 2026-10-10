export const MODEL_IDS = ["M1", "M2", "M3"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export interface ModelDefinition {
  readonly id: ModelId;
  readonly name: string;
  readonly shortDescription: string;
  readonly weightRule: "category" | "per_item" | "uniform_item";
  readonly isAssumption: true;
}

export const MODEL_DEFINITIONS: Readonly<Record<ModelId, ModelDefinition>> =
  Object.freeze({
    M1: {
      id: "M1",
      name: "M1 类别权重",
      shortDescription: "有库存的类别保留完整展示权重，耗尽后移除并重新归一化。",
      weightRule: "category",
      isAssumption: true,
    },
    M2: {
      id: "M2",
      name: "M2 每份带权",
      shortDescription: "类别当前总权重等于剩余份数乘以展示权重。",
      weightRule: "per_item",
      isAssumption: true,
    },
    M3: {
      id: "M3",
      name: "M3 均匀洗牌",
      shortDescription: "25份固定物品均匀随机排列。",
      weightRule: "uniform_item",
      isAssumption: true,
    },
  });

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && MODEL_IDS.includes(value as ModelId);
}

