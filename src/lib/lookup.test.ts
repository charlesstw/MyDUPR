import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuprError } from "./dupr";
import { clearCache, lookupBatch, lookupOne, splitHint, type DuprApi } from "./lookup";
import { isDuprId, parseEntries } from "./parse";
import type { Player } from "./types";

const p = (id: string, fullName: string, duprId = "AB12CD", location: string | null = null): Player => ({
  id,
  duprId,
  fullName,
  doubles: "4.12",
  singles: null,
  location,
  gender: null,
  age: null,
});

const found = (hits: Player[], total: number | null = null) => vi.fn(async () => ({ hits, total }));

function api(overrides: Partial<DuprApi> = {}): DuprApi {
  return {
    getPlayer: vi.fn(async () => null),
    searchPlayers: found([]),
    ...overrides,
  };
}

beforeEach(clearCache);

describe("parseEntries", () => {
  it("trims, drops blanks and duplicates, takes first CSV column", () => {
    expect(parseEntries(' John Doe \n\n"Jane, X",y\njohn doe\r\n1234567,foo')).toEqual([
      "John Doe",
      "Jane, X",
      "1234567",
    ]);
  });

  it("recognises DUPR IDs", () => {
    expect(isDuprId("0YVNWN")).toBe(true);
    expect(isDuprId("Albert")).toBe(false);
  });

  it("splits a location hint in half- or full-width parentheses", () => {
    expect(splitHint("Amy Lee (Taipei)")).toEqual({ query: "Amy Lee", hint: "Taipei" });
    expect(splitHint("王小明（台北）")).toEqual({ query: "王小明", hint: "台北" });
    expect(splitHint("Amy Lee")).toEqual({ query: "Amy Lee", hint: null });
  });
});

describe("lookupOne", () => {
  it("uses getPlayer for numeric ids", async () => {
    const a = api({ getPlayer: vi.fn(async () => p("1234567", "John Doe")) });
    const r = await lookupOne(a, "1234567");
    expect(r.status).toBe("matched");
    expect(a.searchPlayers).not.toHaveBeenCalled();
  });

  it("matches exact DUPR ID among search hits", async () => {
    const a = api({ searchPlayers: found([p("1", "A", "ZZ99ZZ"), p("2", "B", "0YVNWN")]) });
    const r = await lookupOne(a, "0yvnwn");
    expect(r.player?.id).toBe("2");
  });

  it("auto-matches only when DUPR finds exactly one person", async () => {
    expect((await lookupOne(api(), "Nobody")).status).toBe("not_found");

    const one = api({ searchPlayers: found([p("1", "John Doe")], 1) });
    expect((await lookupOne(one, "John Doe")).status).toBe("matched");

    // One hit returned but DUPR says more exist: don't guess.
    const truncated = api({ searchPlayers: found([p("1", "Ann Wu")], 3) });
    expect((await lookupOne(truncated, "Ann Wu")).status).toBe("multiple_candidates");
  });

  it("asks the user even when only one hit has the exact name", async () => {
    const a = api({ searchPlayers: found([p("1", "Amy Lee"), p("2", "Amy Leeson")]) });
    const r = await lookupOne(a, "amy  lee");
    expect(r.status).toBe("multiple_candidates");
    expect(r.candidates?.map((c) => c.id)).toEqual(["1"]);
  });

  it("lists same-name people as candidates", async () => {
    const many = api({ searchPlayers: found([p("1", "Jane Smith"), p("2", "Jane Smith"), p("3", "Jane Smithson")]) });
    const r = await lookupOne(many, "Jane Smith");
    expect(r.status).toBe("multiple_candidates");
    expect(r.candidates?.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("narrows same-name people by location hint and keeps the rest to switch", async () => {
    const hits = [p("1", "Jane Smith", "A1", "Taipei, TW"), p("2", "Jane Smith", "B2", "Austin, TX")];
    const a = api({ searchPlayers: found(hits) });
    const r = await lookupOne(a, "Jane Smith (taipei)");
    expect(a.searchPlayers).toHaveBeenCalledWith("Jane Smith");
    expect(r.status).toBe("matched");
    expect(r.player?.id).toBe("1");
    expect(r.candidates?.length).toBe(2);

    const none = await lookupOne(a, "Jane Smith (Tokyo)");
    expect(none.status).toBe("not_found");
    expect(none.candidates?.length).toBe(2);
  });

  it("marks per-entry errors but rethrows auth errors", async () => {
    const boom = api({ searchPlayers: vi.fn(async () => { throw new DuprError("down", 500); }) });
    expect((await lookupOne(boom, "X")).status).toBe("error");

    const expired = api({ searchPlayers: vi.fn(async () => { throw new DuprError("expired", 401); }) });
    await expect(lookupOne(expired, "Y")).rejects.toThrow("expired");
  });

  it("caches successful lookups", async () => {
    const a = api({ searchPlayers: found([p("1", "John Doe")]) });
    await lookupBatch(a, ["John Doe"]);
    const [r] = await lookupBatch(a, ["john doe"]);
    expect(r.input).toBe("john doe");
    expect(a.searchPlayers).toHaveBeenCalledTimes(1);
  });
});
