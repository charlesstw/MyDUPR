"use client";

import { useEffect, useRef, useState } from "react";
import type { LookupResult, Player } from "@/lib/types";
import { parseEntries } from "@/lib/parse";

const CHUNK = 5;

const STATUS_LABEL: Record<LookupResult["status"], string> = {
  matched: "成功",
  multiple_candidates: "請選擇",
  not_found: "查無此人",
  error: "查詢失敗",
};

interface Me {
  loggedIn: boolean;
  name: string | null;
  batchLimit: number;
}

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ loggedIn: false, name: null, batchLimit: 50 }));
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setMe((m) => (m ? { ...m, loggedIn: false, name: null } : m));
  }

  return (
    <main>
      <header>
        <h1>DUPR 批次查詢</h1>
        {me?.loggedIn && (
          <div className="who">
            已登入{me.name ? `：${me.name}` : ""}
            <button className="link" onClick={logout}>登出</button>
          </div>
        )}
      </header>
      {!me ? (
        <p className="muted">載入中…</p>
      ) : me.loggedIn ? (
        <Lookup batchLimit={me.batchLimit} onExpired={() => setMe({ ...me, loggedIn: false, name: null })} />
      ) : (
        <Login onLogin={(name) => setMe({ ...me, loggedIn: true, name })} />
      )}
    </main>
  );
}

function Login({ onLogin }: { onLogin: (name: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      onLogin(data.name ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h2>登入你的 DUPR 帳號</h2>
      <p className="muted">
        查詢會以你自己的 DUPR 帳號身份進行。密碼只用來向 DUPR 換取登入權杖，不會被儲存。
      </p>
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        密碼
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "登入中…" : "登入"}</button>
    </form>
  );
}

function Lookup({ batchLimit, onExpired }: { batchLimit: number; onExpired: () => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const entries = parseEntries(text);
  const running = progress !== null && progress.done < progress.total;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText((t) => (t.trim() ? `${t.trim()}\n${content}` : content));
    e.target.value = "";
  }

  async function run() {
    setError(null);
    setOpen(null);
    if (entries.length === 0) return setError("請輸入至少一筆查詢內容");
    if (entries.length > batchLimit) return setError(`已超過單次查詢上限（${batchLimit} 筆），請分批查詢`);

    const all: LookupResult[] = [];
    setResults([]);
    setProgress({ done: 0, total: entries.length });
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      try {
        const res = await fetch("/api/batch-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: chunk }),
        });
        const data = await res.json();
        if (res.status === 401) {
          onExpired();
          return;
        }
        if (!res.ok) throw new Error(data.error || "查詢失敗");
        all.push(...data.results);
      } catch (err) {
        const message = (err as Error).message;
        all.push(...chunk.map((input) => ({ input, status: "error" as const, player: null, candidates: null, message })));
      }
      setResults([...all]);
      setProgress({ done: all.length, total: entries.length });
    }
  }

  function choose(row: number, player: Player) {
    setResults((rs) => rs.map((r, i) => (i === row ? { ...r, status: "matched", player, message: undefined } : r)));
    setOpen(null);
  }

  return (
    <>
      <section className="card">
        <label htmlFor="entries">貼上名單（一行一位，可填姓名、DUPR ID 或數字 ID）</label>
        <textarea
          id="entries"
          rows={8}
          placeholder={"John Doe\n0YVNWN\nJane Smith"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={running}
        />
        <div className="actions">
          <span className="muted">
            {entries.length} 筆（上限 {batchLimit}）
          </span>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} />
          <button className="secondary" onClick={() => fileRef.current?.click()} disabled={running}>
            上傳 CSV
          </button>
          <button onClick={run} disabled={running || entries.length === 0}>
            {running ? "查詢中…" : "開始查詢"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {progress && (
          <div className="progress">
            <div className="bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            <span>
              {running ? "查詢中" : "查詢完成"} {progress.done} / {progress.total}
            </span>
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section className="card">
          <div className="actions">
            <h2>查詢結果</h2>
            <button className="secondary" onClick={() => exportCsv(results)} disabled={running}>
              匯出 CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>輸入內容</th>
                  <th>球員</th>
                  <th>DUPR ID</th>
                  <th className="num">雙打</th>
                  <th className="num">單打</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <Row key={i} r={r} expanded={open === i} onToggle={() => setOpen(open === i ? null : i)} onChoose={(p) => choose(i, p)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Row({
  r,
  expanded,
  onToggle,
  onChoose,
}: {
  r: LookupResult;
  expanded: boolean;
  onToggle: () => void;
  onChoose: (p: Player) => void;
}) {
  const p = r.player;
  return (
    <>
      <tr className={`status-${r.status}`}>
        <td>{r.input}</td>
        <td>{p?.fullName ?? "—"}</td>
        <td>{p?.duprId ?? "—"}</td>
        <td className="num">{p ? p.doubles ?? "NR" : "—"}</td>
        <td className="num">{p ? p.singles ?? "NR" : "—"}</td>
        <td>
          {r.status === "multiple_candidates" ? (
            <button className="pill" onClick={onToggle}>
              請選擇（{r.candidates?.length}）{expanded ? "▲" : "▼"}
            </button>
          ) : (
            <span className={`pill ${r.status}`} title={r.message}>
              {r.status === "error" && r.message ? `查詢失敗：${r.message}` : STATUS_LABEL[r.status]}
            </span>
          )}
        </td>
      </tr>
      {expanded && r.candidates && (
        <tr className="candidates">
          <td colSpan={6}>
            <ul>
              {r.candidates.map((c) => (
                <li key={c.id}>
                  <button className="link" onClick={() => onChoose(c)}>
                    {c.fullName}
                  </button>
                  <span className="muted">
                    {[c.duprId, c.location, `雙打 ${c.doubles ?? "NR"}`, `單打 ${c.singles ?? "NR"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function exportCsv(results: LookupResult[]) {
  const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = ["輸入內容", "比對姓名", "DUPR ID", "雙打分數", "單打分數", "狀態"];
  const lines = results.map((r) =>
    [r.input, r.player?.fullName, r.player?.duprId, r.player?.doubles, r.player?.singles, STATUS_LABEL[r.status]]
      .map(esc)
      .join(","),
  );
  // BOM so Excel opens UTF-8 Chinese correctly.
  const blob = new Blob(["﻿" + [header.map(esc).join(","), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `dupr-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
