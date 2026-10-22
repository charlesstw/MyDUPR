// Diagnose DUPR login (incl. emailed 2FA code) and search: `npm run check-dupr`
// Prints HTTP status codes, messages and field names only — never the password or tokens.
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";

const BASE = (process.env.DUPR_API_BASE || "https://api.dupr.com").replace(/\/$/, "");
const ACCESS_COOKIE = "__Host-dupr_at";

// Line reader that works for both a terminal and piped input.
const rl = readline.createInterface({ input: stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
const stty = (arg) => stdin.isTTY && spawnSync("stty", [arg], { stdio: "inherit" });
async function ask(prompt, hidden = false) {
  stdout.write(prompt);
  if (hidden) stty("-echo");
  const { value = "" } = await lines.next();
  if (hidden) stty("echo");
  if (hidden || !stdin.isTTY) stdout.write("\n");
  return value.trim();
}

const keys = (o) => (o && typeof o === "object" ? Object.keys(o).join(", ") : String(o).slice(0, 80));

async function call(path, body, token, auth = "bearer") {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token && auth === "bearer") headers.Authorization = `Bearer ${token}`;
  if (token && auth === "cookie")
    Object.assign(headers, {
      Cookie: `${ACCESS_COOKIE}=${token}`,
      Origin: "https://dashboard.dupr.com",
      Referer: "https://dashboard.dupr.com/",
    });
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, body: json, text, headers: res.headers };
  } catch (err) {
    return { status: "network error", error: err.cause?.code || err.message };
  }
}

function report(label, r) {
  console.log(`\n${label} -> ${r.status}${r.error ? ` (${r.error})` : ""}`);
  if (r.body) {
    console.log(`  top-level keys: ${keys(r.body)}`);
    if (r.body.result) console.log(`  result keys:    ${keys(r.body.result)}`);
    for (const k of ["message", "errorCode", "requiredActions", "twoFactorMethods", "defaultMethod", "requirements"]) {
      if (r.body[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(r.body[k])}`);
    }
  } else if (r.text) {
    console.log(`  body (non-JSON): ${r.text.slice(0, 120).replace(/\s+/g, " ")}`);
  }
  const cookies = r.headers?.getSetCookie?.() ?? [];
  if (cookies.length) console.log(`  set-cookie names: ${cookies.map((c) => c.split("=")[0]).join(", ")}`);
}

function tokenOf(r) {
  const fromCookie = (r.headers?.getSetCookie?.() ?? [])
    .map((c) => c.match(new RegExp(`^${ACCESS_COOKIE}=([^;]+)`))?.[1])
    .find(Boolean);
  return r.body?.result?.accessToken ?? r.body?.accessToken ?? fromCookie ?? null;
}

const email = await ask("DUPR Email: ");
const password = await ask("DUPR 密碼（輸入時不會顯示）: ", true);

const login = await call("/auth/v1.0/login/", { email, password });
report(`POST ${BASE}/auth/v1.0/login/`, login);
let token = login.status === 200 ? tokenOf(login) : null;

if (!token && login.status === 428 && login.body?.challengeToken) {
  const code = await ask("\n請輸入 Email 收到的 6 位數驗證碼: ");
  const v = await call("/auth/v1.0/2fa/verify", { challengeToken: login.body.challengeToken, code });
  report(`POST ${BASE}/auth/v1.0/2fa/verify`, v);
  if (v.status === 200) token = tokenOf(v);
}
rl.close();

if (!token) {
  console.log("\n❌ 沒拿到登入 token。請把上面的輸出整段貼給 Claude。");
  process.exit(1);
}

console.log("\n✅ 登入成功，測試搜尋…");
const searchBody = {
  query: "smith",
  limit: 2,
  offset: 0,
  exclude: [],
  includeUnclaimedPlayers: true,
  filter: { rating: { maxRating: null, minRating: null }, locationText: "" },
};
for (const auth of ["bearer", "cookie"]) {
  const s = await call("/player/v1.0/search", searchBody, token, auth);
  report(`POST /player/v1.0/search [${auth}]`, s);
  const hit = s.body?.result?.hits?.[0];
  if (hit) {
    console.log(`  hit keys: ${keys(hit)}`);
    console.log(`  ratings:  ${JSON.stringify(hit.ratings)}`);
  }
}
console.log("\n請把上面的輸出整段貼給 Claude（不含密碼與 token）。");
