import pLimit from "p-limit";
import { DuprError } from "./dupr";
import { isDuprId, isNumericId } from "./parse";
import type { LookupResult, Player, SearchResult } from "./types";

export const BATCH_LIMIT = Number(process.env.BATCH_LIMIT) || 50;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DuprApi {
  getPlayer(id: string): Promise<Player | null>;
  searchPlayers(query: string): Promise<SearchResult>;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** "王小明 (Taipei)" / "王小明（台北）" → name + location hint. */
export function splitHint(input: string): { query: string; hint: string | null } {
  const m = input.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*$/);
  return m && m[1].trim() ? { query: m[1].trim(), hint: m[2].trim() } : { query: input, hint: null };
}

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

    const { query, hint } = splitHint(input);
    const { hits, total } = await api.searchPlayers(query);

    if (isDuprId(query)) {
      const exact = hits.find((p) => p.duprId?.toUpperCase() === query.toUpperCase());
      if (exact) return { ...base, status: "matched", player: exact };
    }

    // Prefer people whose name matches exactly, then narrow by the location hint.
    const exactName = hits.filter((p) => norm(p.fullName) === norm(query));
    let pool = exactName.length > 0 ? exactName : hits;
    if (hint) {
      const h = norm(hint);
      const nearby = pool.filter((p) => p.location && norm(p.location).includes(h));
      if (nearby.length === 0) {
        return { ...base, status: "not_found", candidates: pool.length ? pool : null, message: `查無位於「${hint}」的同名球員` };
      }
      pool = nearby;
    }

    if (pool.length === 0) return { ...base, status: "not_found", message: "查無此人" };

    // Names are ambiguous: only auto-pick when DUPR found exactly one person in total
    // (or the location hint left exactly one). Keep the rest so the user can switch.
    const onlyOne = hint ? pool.length === 1 : hits.length === 1 && (total === null || total <= 1);
    if (onlyOne) {
      return { ...base, status: "matched", player: pool[0], candidates: hits.length > 1 ? hits : null };
    }
    return { ...base, status: "multiple_candidates", candidates: pool };
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
