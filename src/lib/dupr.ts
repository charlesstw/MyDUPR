import type { Player, SearchResult } from "./types";

// Unofficial DUPR API, the same one dashboard.dupr.com uses.
export const DUPR_API_BASE = (process.env.DUPR_API_BASE || "https://api.dupr.com").replace(/\/$/, "");
// Since 2026 DUPR also returns the access token as this cookie after 2FA.
const ACCESS_COOKIE = "__Host-dupr_at";

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class DuprError extends Error {
  constructor(message: string, public status: number, public body: any = null) {
    super(message);
  }
}

// How to present the token: DUPR has accepted a Bearer header historically, and
// dashboard.dupr.com now uses the __Host-dupr_at cookie. Try one, fall back to the
// other on 401, and remember whichever worked.
type AuthMode = "bearer" | "cookie";
let authMode: AuthMode = "bearer";

async function request(path: string, init: RequestInit & { token?: string } = {}): Promise<any> {
  if (!init.token) return (await send(path, init)).body;
  try {
    return (await send(path, { ...init, auth: authMode })).body;
  } catch (err) {
    if (!(err instanceof DuprError && err.status === 401)) throw err;
    const other: AuthMode = authMode === "bearer" ? "cookie" : "bearer";
    const body = (await send(path, { ...init, auth: other })).body;
    console.log(`[DUPR] switched auth mode to ${other}`);
    authMode = other;
    return body;
  }
}

async function send(
  path: string,
  init: RequestInit & { token?: string; auth?: AuthMode } = {},
): Promise<{ body: any; headers: Headers }> {
  const { token, auth = "bearer", ...rest } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token && auth === "bearer") headers.Authorization = `Bearer ${token}`;
  if (token && auth === "cookie") {
    headers.Cookie = `${ACCESS_COOKIE}=${token}`;
    // Cookie-authenticated calls come from the dashboard origin in the browser.
    headers.Origin = "https://dashboard.dupr.com";
    headers.Referer = "https://dashboard.dupr.com/";
  }

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${DUPR_API_BASE}${path}`, {
        ...rest,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) continue;
      const cause = (err as any)?.cause?.code || (err as Error).message;
      console.error(`[DUPR] ${rest.method ?? "GET"} ${path} -> network error: ${cause}`);
      // status 0 = never got a response from DUPR
      throw new DuprError(`無法連線到 DUPR（${cause}）`, 0);
    }

    // FRD 5: back off and retry on rate limiting.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, (retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000));
      continue;
    }

    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      // Logged to the server console only; never includes request bodies (passwords).
      const redacted = text.replace(/("(?:challengeToken|accessToken|refreshToken)"\s*:\s*")[^"]*/g, "$1…");
      console.error(`[DUPR] ${rest.method ?? "GET"} ${path} -> ${res.status} ${redacted.slice(0, 300)}`);
      const msg = body?.message || body?.error || `DUPR 回應 ${res.status}`;
      throw new DuprError(msg, res.status, body);
    }
    return { body, headers: res.headers };
  }
}

export type LoginResult =
  | { kind: "ok"; accessToken: string; fullName: string | null }
  | { kind: "challenge"; challengeToken: string; message: string };

function sessionFrom(body: any, headers: Headers): LoginResult & { kind: "ok" } {
  const result = body?.result ?? body ?? {};
  const fromCookie = headers
    .getSetCookie()
    .map((c) => c.match(new RegExp(`^${ACCESS_COOKIE}=([^;]+)`))?.[1])
    .find(Boolean);
  const accessToken = result.accessToken ?? result.token ?? fromCookie;
  if (!accessToken) {
    console.error(`[DUPR] login response had no token; keys: ${Object.keys(result).join(", ")}`);
    throw new DuprError(body?.message || "DUPR 登入回應格式不符", 500);
  }
  const user = result.user ?? result;
  const fullName = user.fullName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || null);
  return { kind: "ok", accessToken, fullName };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const { body, headers } = await send("/auth/v1.0/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return sessionFrom(body, headers);
  } catch (err) {
    // 428 = DUPR wants a second factor (6-digit code emailed to the user).
    if (err instanceof DuprError && err.status === 428 && err.body?.challengeToken) {
      return {
        kind: "challenge",
        challengeToken: err.body.challengeToken,
        message: err.body.message ?? "請輸入 DUPR 寄到你 Email 的 6 位數驗證碼",
      };
    }
    throw err;
  }
}

export async function verify2fa(challengeToken: string, code: string) {
  const { body, headers } = await send("/auth/v1.0/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ challengeToken, code }),
  });
  return sessionFrom(body, headers);
}

function rating(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function toPlayer(raw: any): Player {
  const ratings = raw?.ratings ?? {};
  return {
    id: String(raw?.id ?? ""),
    duprId: raw?.duprId ?? null,
    fullName: raw?.fullName ?? [raw?.firstName, raw?.lastName].filter(Boolean).join(" "),
    doubles: rating(ratings.doubles),
    singles: rating(ratings.singles),
    location: raw?.shortAddress ?? raw?.formattedAddress ?? null,
    gender: raw?.gender ?? null,
    age: typeof raw?.age === "number" ? raw.age : null,
  };
}

export async function getPlayer(token: string, id: string): Promise<Player | null> {
  try {
    const body = await request(`/player/v1.0/${encodeURIComponent(id)}`, { token });
    return body?.result ? toPlayer(body.result) : null;
  } catch (err) {
    if (err instanceof DuprError && err.status === 404) return null;
    throw err;
  }
}

export async function searchPlayers(token: string, query: string, limit = 25): Promise<SearchResult> {
  const body = await request("/player/v1.0/search", {
    method: "POST",
    token,
    body: JSON.stringify({
      query,
      limit,
      offset: 0,
      exclude: [],
      includeUnclaimedPlayers: true,
      filter: { rating: { maxRating: null, minRating: null }, locationText: "" },
    }),
  });
  const hits: any[] = body?.result?.hits ?? [];
  const total = Number(body?.result?.total);
  return { hits: hits.map(toPlayer), total: Number.isFinite(total) ? total : null };
}
