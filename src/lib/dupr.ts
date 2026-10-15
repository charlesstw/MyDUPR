import type { Player } from "./types";

// Unofficial DUPR API, the same one the DUPR web app uses.
export const DUPR_API_BASE = (process.env.DUPR_API_BASE || "https://api.dupr.gg").replace(/\/$/, "");

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class DuprError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request(path: string, init: RequestInit & { token?: string } = {}): Promise<any> {
  const { token, ...rest } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

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
      throw new DuprError(`無法連線到 DUPR：${(err as Error).message}`, 502);
    }

    // FRD 5: back off and retry on rate limiting.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, (retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000));
      continue;
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.message || body?.error || `DUPR 回應 ${res.status}`;
      throw new DuprError(msg, res.status);
    }
    return body;
  }
}

export interface LoginResult {
  accessToken: string;
  fullName: string | null;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const body = await request("/auth/v1.0/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const result = body?.result ?? {};
  const accessToken = result.accessToken;
  if (!accessToken) throw new DuprError(body?.message || "登入失敗", 401);
  return { accessToken, fullName: result.user?.fullName ?? null };
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

export async function searchPlayers(token: string, query: string, limit = 10): Promise<Player[]> {
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
  return hits.map(toPlayer);
}
