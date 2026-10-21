import { cookies } from "next/headers";

// The user's own DUPR access token lives only in an httpOnly cookie:
// page JavaScript can't read it, and the password is never stored.
const COOKIE = "dupr_token";
const NAME_COOKIE = "dupr_name";
const MAX_AGE = 7 * 24 * 60 * 60;

export async function getToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function getName(): Promise<string | null> {
  return (await cookies()).get(NAME_COOKIE)?.value ?? null;
}

export async function setSession(token: string, name: string | null) {
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
  jar.set(COOKIE, token, opts);
  jar.set(NAME_COOKIE, name ?? "", opts);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(NAME_COOKIE);
}

// Pending 2FA challenge between the password step and the code step.
const CHALLENGE_COOKIE = "dupr_challenge";

export async function setChallenge(challengeToken: string, method: string | null) {
  (await cookies()).set(CHALLENGE_COOKIE, JSON.stringify({ challengeToken, method }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
  });
}

export async function getChallenge(): Promise<{ challengeToken: string; method: string | null } | null> {
  const raw = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearChallenge() {
  (await cookies()).delete(CHALLENGE_COOKIE);
}
