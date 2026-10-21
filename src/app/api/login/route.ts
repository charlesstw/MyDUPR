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
    const code = err instanceof DuprError ? err.status : -1;
    const detail = (err as Error).message;
    if (code === 400 || code === 401) {
      return NextResponse.json({ error: `登入失敗，請確認 DUPR 帳號密碼（DUPR：${detail}）` }, { status: 401 });
    }
    const error = code === 0 ? detail : `DUPR 登入異常（${code > 0 ? `HTTP ${code}：` : ""}${detail}）`;
    return NextResponse.json({ error }, { status: 502 });
  }
}
