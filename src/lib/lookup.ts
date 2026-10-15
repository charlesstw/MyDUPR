import pLimit from "p-limit";
import { DuprError } from "./dupr";
import { isDuprId, isNumericId } from "./parse";
import type { LookupResult, Player } from "./types";

export const BATCH_LIMIT = Number(process.env.BATCH_LIMIT) || 50;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DuprApi {
  getPlayer(id: string): Promise<Player | null>;
  searchPlayers(query: string): Promise<Player[]>;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const cache = new Map<string, { at: number; result: LookupResult }>();

export async function lookupOne(api: DuprApi, input: string): Promise<LookupResult> {
  const key = norm(input);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.result, input };

  const result = await doLookup(api, input);
  if (result.status !== "error") cache.set(key, { at: Date.now(), result });
  return result;
}

async function doLookup(api: DuprApi, input: string): Promise<LookupResult> {
  const base = { input, player: null, candidates: null };
  try {
    if (isNumericId(input)) {
      const player = await api.getPlayer(input);
      if (player) return { ...base, status: "matched", player };
    }

    const hits = await api.searchPlayers(input);

    if (isDuprId(input)) {
      const exact = hits.find((p) => p.duprId?.toUpperCase() === input.toUpperCase());
      if (exact) return { ...base, status: "matched", player: exact };
    }

    if (hits.length === 0) return { ...base, status: "not_found", message: "查無此人" };
    if (hits.length === 1) return { ...base, status: "matched", player: hits[0] };

    const exactName = hits.filter((p) => norm(p.fullName) === norm(input));
    if (exactName.length === 1) return { ...base, status: "matched", player: exactName[0] };

    return {
      ...base,
      status: "multiple_candidates",
      candidates: exactName.length > 1 ? exactName : hits,
    };
  } catch (err) {
    if (err instanceof DuprError && err.status === 401) throw err;
    return { ...base, status: "error", message: (err as Error).message || "查詢失敗" };
  }
}

export async function lookupBatch(api: DuprApi, entries: string[]): Promise<LookupResult[]> {
  const limit = pLimit(CONCURRENCY);
  return Promise.all(entries.map((e) => limit(() => lookupOne(api, e))));
}

export function clearCache() {
  cache.clear();
}
