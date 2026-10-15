import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuprError } from "./dupr";
import { clearCache, lookupBatch, lookupOne, type DuprApi } from "./lookup";
import { isDuprId, parseEntries } from "./parse";
import type { Player } from "./types";

const p = (id: string, fullName: string, duprId = "AB12CD"): Player => ({
  id,
  duprId,
  fullName,
  doubles: "4.12",
  singles: null,
  location: null,
});

function api(overrides: Partial<DuprApi> = {}): DuprApi {
  return {
    getPlayer: vi.fn(async () => null),
    searchPlayers: vi.fn(async () => []),
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
});

describe("lookupOne", () => {
  it("uses getPlayer for numeric ids", async () => {
    const a = api({ getPlayer: vi.fn(async () => p("1234567", "John Doe")) });
    const r = await lookupOne(a, "1234567");
    expect(r.status).toBe("matched");
    expect(a.searchPlayers).not.toHaveBeenCalled();
  });

  it("matches exact DUPR ID among search hits", async () => {
    const a = api({ searchPlayers: vi.fn(async () => [p("1", "A", "ZZ99ZZ"), p("2", "B", "0YVNWN")]) });
    const r = await lookupOne(a, "0yvnwn");
    expect(r.player?.id).toBe("2");
  });

  it("returns not_found, single match, and candidates", async () => {
    expect((await lookupOne(api(), "Nobody")).status).toBe("not_found");

    const one = api({ searchPlayers: vi.fn(async () => [p("1", "John Doe")]) });
    expect((await lookupOne(one, "John")).status).toBe("matched");

    const many = api({ searchPlayers: vi.fn(async () => [p("1", "Jane Smith"), p("2", "Jane Smith"), p("3", "Jane Smithson")]) });
    const r = await lookupOne(many, "Jane Smith");
    expect(r.status).toBe("multiple_candidates");
    expect(r.candidates?.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("prefers the unique exact-name hit", async () => {
    const a = api({ searchPlayers: vi.fn(async () => [p("1", "Amy Lee"), p("2", "Amy Leeson")]) });
    expect((await lookupOne(a, "amy  lee")).player?.id).toBe("1");
  });

  it("marks per-entry errors but rethrows auth errors", async () => {
    const boom = api({ searchPlayers: vi.fn(async () => { throw new DuprError("down", 500); }) });
    expect((await lookupOne(boom, "X")).status).toBe("error");

    const expired = api({ searchPlayers: vi.fn(async () => { throw new DuprError("expired", 401); }) });
    await expect(lookupOne(expired, "Y")).rejects.toThrow("expired");
  });

  it("caches successful lookups", async () => {
    const a = api({ searchPlayers: vi.fn(async () => [p("1", "John Doe")]) });
    await lookupBatch(a, ["John Doe"]);
    const [r] = await lookupBatch(a, ["john doe"]);
    expect(r.input).toBe("john doe");
    expect(a.searchPlayers).toHaveBeenCalledTimes(1);
  });
});
