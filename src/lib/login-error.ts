import { NextResponse } from "next/server";
import { DuprError } from "./dupr";

/** Map a DUPR auth failure to a user-facing JSON error. */
export function loginError(err: unknown, badInput: string) {
  const code = err instanceof DuprError ? err.status : -1;
  const detail = (err as Error).message;
  // An empty 400 comes from DUPR's load balancer, not its login service: the
  // request was turned away before DUPR checked the account.
  if (code === 400 && err instanceof DuprError && err.body == null) {
    return NextResponse.json(
      { error: "DUPR 的伺服器在檢查帳密之前就拒絕了這個連線（HTTP 400，無內容），通常是不接受從這個網路發出的登入；請改在自己的電腦上執行。" },
      { status: 502 },
    );
  }
  if (code === 400 || code === 401) {
    return NextResponse.json({ error: `${badInput}（DUPR：${detail}）` }, { status: 401 });
  }
  const error = code === 0 ? detail : `DUPR 登入異常（${code > 0 ? `HTTP ${code}：` : ""}${detail}）`;
  return NextResponse.json({ error }, { status: 502 });
}
