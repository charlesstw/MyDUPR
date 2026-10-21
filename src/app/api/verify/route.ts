import { NextResponse } from "next/server";
import { verify2fa } from "@/lib/dupr";
import { loginError } from "@/lib/login-error";
import { clearChallenge, getChallenge, setSession } from "@/lib/session";

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}));
  const clean = typeof code === "string" ? code.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(clean)) return NextResponse.json({ error: "請輸入 6 位數驗證碼" }, { status: 400 });

  const challenge = await getChallenge();
  if (!challenge) return NextResponse.json({ error: "驗證已逾時，請重新登入" }, { status: 401 });

  try {
    const r = await verify2fa(challenge.challengeToken, clean, challenge.method);
    await clearChallenge();
    await setSession(r.accessToken, r.fullName);
    return NextResponse.json({ loggedIn: true, name: r.fullName });
  } catch (err) {
    return loginError(err, "驗證碼錯誤或已過期");
  }
}
