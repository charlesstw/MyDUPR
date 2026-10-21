import { NextResponse } from "next/server";
import { login } from "@/lib/dupr";
import { loginError } from "@/lib/login-error";
import { clearChallenge, setChallenge, setSession } from "@/lib/session";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json({ error: "請輸入 DUPR 帳號與密碼" }, { status: 400 });
  }
  try {
    const r = await login(email.trim(), password);
    if (r.kind === "challenge") {
      await setChallenge(r.challengeToken, r.method);
      return NextResponse.json({ needsCode: true, message: r.message });
    }
    await clearChallenge();
    await setSession(r.accessToken, r.fullName);
    return NextResponse.json({ loggedIn: true, name: r.fullName });
  } catch (err) {
    return loginError(err, "登入失敗，請確認 DUPR 帳號密碼");
  }
}
