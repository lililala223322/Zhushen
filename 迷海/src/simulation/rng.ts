import type { ModelId } from "../domain/models";

export type Seed = string | number | bigint;

export const PRNG_NAME = "mulberry32";
export const PRNG_VERSION = "1";

const UINT32_RANGE = 0x1_0000_0000;

function avalanche32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193);
  }
  return avalanche32(hash);
}

export function normalizeSeed(seed: Seed): number {
  if (typeof seed === "string") {
    return hashString(seed);
  }
  if (typeof seed === "bigint") {
    return avalanche32(
      Number(seed & 0xffff_ffffn) ^ Number((seed >> 32n) & 0xffff_ffffn),
    );
  }
  if (!Number.isFinite(seed)) {
    throw new RangeError("Seed number must be finite.");
  }
  const low = seed >>> 0;
  const high = Math.floor(seed / UINT32_RANGE) >>> 0;
  return avalanche32(low ^ high);
}

export function hashComponents(
  baseSeedHash: number,
  ...components: readonly (number | string)[]
): number {
  let hash = baseSeedHash >>> 0;
  for (const component of components) {
    const value =
      typeof component === "number"
        ? avalanche32(component >>> 0)
        : hashString(component);
    hash = avalanche32(hash ^ value ^ 0x9e3779b9);
  }
  return hash >>> 0;
}

/**
 * Pairing contract: no strategy identifier is included. For a fixed model,
 * every strategy sees the same complete order at (episodeIndex, mapIndex).
 */
export function deriveMapSeedFromHash(
  masterSeedHash: number,
  episodeIndex: number,
  mapIndex: number,
  model: ModelId,
): number {
  return hashComponents(masterSeedHash, episodeIndex, mapIndex, model);
}

export function deriveMapSeed(
  masterSeed: Seed,
  episodeIndex: number,
  mapIndex: number,
  model: ModelId,
): number {
  return deriveMapSeedFromHash(
    normalizeSeed(masterSeed),
    episodeIndex,
    mapIndex,
    model,
  );
}

export class Mulberry32 {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  public nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Exact bounded integer sampling via rejection (no modulo bias). */
  public nextInt(maxExclusive: number): number {
    if (
      !Number.isSafeInteger(maxExclusive) ||
      maxExclusive <= 0 ||
      maxExclusive > UINT32_RANGE
    ) {
      throw new RangeError("maxExclusive must be an integer in [1, 2^32].");
    }
    if (maxExclusive === UINT32_RANGE) {
      return this.nextUint32();
    }
    const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    let value: number;
    do {
      value = this.nextUint32();
    } while (value >= limit);
    return value % maxExclusive;
  }

  public clone(): Mulberry32 {
    return new Mulberry32(this.state);
  }
}

