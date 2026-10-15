import { NextResponse } from "next/server";
import { DuprError, login } from "@/lib/dupr";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json({ error: "請輸入 DUPR 帳號與密碼" }, { status: 400 });
  }
  try {
    const { accessToken, fullName } = await login(email.trim(), password);
    await setSession(accessToken, fullName);
    return NextResponse.json({ loggedIn: true, name: fullName });
  } catch (err) {
    const status = err instanceof DuprError && err.status < 500 ? 401 : 502;
    const error = status === 401 ? "登入失敗，請確認 DUPR 帳號密碼" : "DUPR 連線異常，請稍後再試";
    return NextResponse.json({ error }, { status });
  }
}
