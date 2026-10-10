import type { ModelId } from "../../src/domain/models";
import type { EpisodeResult } from "../../src/domain/state";
import type { EpisodeObservation } from "../../src/reports/types";
import { createMapGenerator } from "../../src/simulation/mapGenerator";
import type { MapOrderProvider } from "../../src/simulation/simulator";
import type { Seed } from "../../src/simulation/rng";

export function toObservation(result: EpisodeResult): EpisodeObservation {
  return {
    cost: result.cost,
    success: result.success,
    resetsUsed: result.resetsUsed,
    mapsUsed: result.mapsUsed,
    finalFragments: result.finalFragments,
    fragmentAwards: {
      5: result.fragmentAwards[5],
      15: result.fragmentAwards[15],
      30: result.fragmentAwards[30],
    },
  };
}

/**
 * One-episode cache used by paired formal evaluation. Strategies see the same
 * immutable full order, while generation is paid only once per map coordinate.
 */
export function createEpisodeMapCache(
  masterSeed: Seed,
  model: ModelId,
  episodeIndex: number,
): MapOrderProvider {
  const generate = createMapGenerator(masterSeed, model);
  return createEpisodeMapCacheFromGenerator(generate, model, episodeIndex);
}

export function createEpisodeMapCacheFromGenerator(
  generate: (episodeIndex: number, mapIndex: number) => Uint8Array,
  model: ModelId,
  episodeIndex: number,
): MapOrderProvider {
  const maps = new Map<number, Uint8Array>();
  return (requestedEpisode, mapIndex, requestedModel) => {
    if (requestedEpisode !== episodeIndex || requestedModel !== model) {
      throw new Error("Episode map cache used with mismatched coordinates.");
    }
    let order = maps.get(mapIndex);
    if (order === undefined) {
      order = generate(episodeIndex, mapIndex);
      maps.set(mapIndex, order);
    }
    return order;
  };
}

export interface PrecomputedMapOrders {
  readonly startEpisode: number;
  readonly episodes: number;
  readonly maxMaps: number;
  readonly model: ModelId;
  readonly provider: MapOrderProvider;
}

/**
 * Coordinate search evaluates many policies on identical maps. A compact
 * contiguous buffer avoids regenerating weighted permutations for every
 * candidate and makes common-random-number comparisons exact.
 */
export function precomputeMapOrders(
  masterSeed: Seed,
  model: ModelId,
  startEpisode: number,
  episodes: number,
  maxMaps: number,
  onProgress?: (completedEpisodes: number) => void,
): PrecomputedMapOrders {
  const bytesPerEpisode = maxMaps * 25;
  const storage = new Uint8Array(episodes * bytesPerEpisode);
  const generate = createMapGenerator(masterSeed, model);
  for (let localEpisode = 0; localEpisode < episodes; localEpisode += 1) {
    const episodeIndex = startEpisode + localEpisode;
    for (let mapIndex = 0; mapIndex < maxMaps; mapIndex += 1) {
      const order = generate(episodeIndex, mapIndex);
      storage.set(order, localEpisode * bytesPerEpisode + mapIndex * 25);
    }
    if ((localEpisode + 1) % 10_000 === 0 || localEpisode + 1 === episodes) {
      onProgress?.(localEpisode + 1);
    }
  }
  const provider: MapOrderProvider = (episodeIndex, mapIndex, requestedModel) => {
    const localEpisode = episodeIndex - startEpisode;
    if (
      requestedModel !== model ||
      localEpisode < 0 ||
      localEpisode >= episodes ||
      mapIndex < 0 ||
      mapIndex >= maxMaps
    ) {
      throw new RangeError("Precomputed map coordinates are outside the cached range.");
    }
    const offset = localEpisode * bytesPerEpisode + mapIndex * 25;
    return storage.subarray(offset, offset + 25);
  };
  return { startEpisode, episodes, maxMaps, model, provider };
}
