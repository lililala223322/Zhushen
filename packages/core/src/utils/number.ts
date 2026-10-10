export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function formatNumber(value: number, digits = 4): string {
  return String(round(value, digits));
}

export interface EffectiveLevelBreakdown {
  total: number;
  before60: number;
  after60: number;
}

export function effectiveLevels(fromLevel: number, toLevel: number): EffectiveLevelBreakdown {
  const from = Number(fromLevel);
  const to = Number(toLevel);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    return { total: 0, before60: 0, after60: 0 };
  }
  const before60 = Math.max(0, Math.min(to, 60) - from + 1);
  const after60 = Math.max(0, to - Math.max(from, 61) + 1);
  return {
    total: before60 + after60 * 0.35,
    before60,
    after60,
  };
}
