import { NextResponse } from "next/server";
import { DuprError } from "./dupr";

/** Map a DUPR auth failure to a user-facing JSON error. */
export function loginError(err: unknown, badInput: string) {
  const code = err instanceof DuprError ? err.status : -1;
  const detail = (err as Error).message;
  if (code === 400 || code === 401) {
    return NextResponse.json({ error: `${badInput}（DUPR：${detail}）` }, { status: 401 });
  }
  const error = code === 0 ? detail : `DUPR 登入異常（${code > 0 ? `HTTP ${code}：` : ""}${detail}）`;
  return NextResponse.json({ error }, { status: 502 });
}
