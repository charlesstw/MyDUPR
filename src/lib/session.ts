import { cookies, headers } from "next/headers";

// Secure cookies only over HTTPS (hosting proxies set x-forwarded-proto), so
// `npm start` still works on http://localhost.
async function secure() {
  return (await headers()).get("x-forwarded-proto") === "https";
}

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
    secure: await secure(),
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

export async function setChallenge(challengeToken: string) {
  (await cookies()).set(CHALLENGE_COOKIE, challengeToken, {
    httpOnly: true,
    secure: await secure(),
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
  });
}

export async function getChallenge(): Promise<string | null> {
  return (await cookies()).get(CHALLENGE_COOKIE)?.value ?? null;
}

export async function clearChallenge() {
  (await cookies()).delete(CHALLENGE_COOKIE);
}
