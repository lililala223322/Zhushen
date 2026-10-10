import { describe, expect, it } from "vitest";

import {
  costHistogramOption,
  cumulativeProbabilitiesAtCosts,
} from "../src/ui/chartOptions";
import type { CostHistogramSeries } from "../src/ui/workerTypes";

const primarySeries: CostHistogramSeries = {
  key: "M1:optimized",
  strategyId: "optimized",
  strategyName: "优化策略",
  modelId: "M1",
  bins: [
    { value: 137, count: 2, probability: 0.2 },
    { value: 139, count: 3, probability: 0.3 },
    { value: 145, count: 5, probability: 0.5 },
  ],
};

describe("cost chart probability mode", () => {
  it("shows cumulative probability at each cost, including empty union bins", () => {
    expect(
      cumulativeProbabilitiesAtCosts(primarySeries.bins, [137, 138, 139, 145]),
    ).toEqual([0.2, 0.2, 0.5, 1]);
  });

  it("renders probability as a cumulative step line while count stays per-bin", () => {
    const probabilityOption = costHistogramOption(
      [
        primarySeries,
        {
          ...primarySeries,
          key: "M1:comparison",
          strategyId: "comparison",
          strategyName: "对照",
          bins: [
            { value: 138, count: 1, probability: 0.5 },
            { value: 145, count: 1, probability: 0.5 },
          ],
        },
      ],
      "probability",
    );
    const probabilitySeries = probabilityOption.series as unknown as Array<{
      type: string;
      step?: string;
      data: number[];
    }>;
    expect(probabilitySeries[0]).toMatchObject({
      type: "line",
      step: "end",
      data: [0.2, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1],
    });

    const countOption = costHistogramOption([primarySeries], "count");
    const countSeries = countOption.series as unknown as Array<{
      type: string;
      data: number[];
    }>;
    expect(countSeries[0]).toMatchObject({
      type: "bar",
      data: [2, 0, 3, 0, 0, 0, 0, 0, 5],
    });
  });
});
