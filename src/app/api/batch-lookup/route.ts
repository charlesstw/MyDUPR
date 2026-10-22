import { NextResponse } from "next/server";
import { DuprError, getPlayer, searchPlayers } from "@/lib/dupr";
import { BATCH_LIMIT, lookupBatch } from "@/lib/lookup";
import { clearSession, getToken } from "@/lib/session";

export async function POST(req: Request) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "請先登入 DUPR" }, { status: 401 });

  const { entries } = await req.json().catch(() => ({}));
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "請輸入至少一筆查詢內容" }, { status: 400 });
  }
  const clean = entries.map((e) => String(e).trim()).filter(Boolean);
  if (clean.length === 0) return NextResponse.json({ error: "請輸入至少一筆查詢內容" }, { status: 400 });
  if (clean.length > BATCH_LIMIT) {
    return NextResponse.json({ error: `已超過單次查詢上限（${BATCH_LIMIT} 筆），請分批查詢` }, { status: 400 });
  }

  try {
    const results = await lookupBatch(
      { getPlayer: (id) => getPlayer(token, id), searchPlayers: (q) => searchPlayers(token, q) },
      clean,
    );
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof DuprError && err.status === 401) {
      await clearSession();
      return NextResponse.json(
        { error: `DUPR 拒絕了這次查詢，請重新登入（DUPR：${err.message}）` },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "DUPR 連線異常，請稍後再試" }, { status: 502 });
  }
}
