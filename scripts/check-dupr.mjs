// Diagnose DUPR login/search from this machine: `npm run check-dupr`
// Prints HTTP status codes and response field names only — never the password or tokens.
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const BASES = [process.env.DUPR_API_BASE, "https://api.dupr.gg", "https://backend.mydupr.com"].filter(
  (b, i, a) => b && a.indexOf(b) === i,
);

async function askCredentials() {
  if (!stdin.isTTY) {
    // Piped input: first line email, second line password.
    let data = "";
    for await (const chunk of stdin) data += chunk;
    const [e = "", p = ""] = data.split(/\r?\n/);
    return [e.trim(), p];
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const e = (await rl.question("DUPR Email: ")).trim();
  // Hide password echo.
  const write = rl._writeToOutput;
  rl._writeToOutput = (str) => (str.includes("DUPR 密碼") ? write.call(rl, str) : undefined);
  const p = await rl.question("DUPR 密碼（輸入時不會顯示）: ");
  rl._writeToOutput = write;
  stdout.write("\n");
  rl.close();
  return [e, p];
}
const [email, password] = await askCredentials();

const keys = (o) => (o && typeof o === "object" ? Object.keys(o).join(", ") : String(o).slice(0, 80));

async function call(url, init) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {}
    return { status: res.status, body, text };
  } catch (err) {
    return { status: "network error", error: err.cause?.code || err.message };
  }
}

let token = null;
let base = null;
// One login attempt per base: each attempt may email a new verification code.
for (const b of BASES) {
  const r = await call(`${b}/auth/v1.0/login/`, { method: "POST", body: JSON.stringify({ email, password }) });
  console.log(`\nPOST ${b}/auth/v1.0/login/ -> ${r.status}${r.error ? ` (${r.error})` : ""}`);
  if (r.status === "network error") continue;
  if (r.body) {
    console.log(`  top-level keys: ${keys(r.body)}`);
    if (r.body.result) console.log(`  result keys:    ${keys(r.body.result)}`);
    // Non-secret hint fields, printed in full; challengeToken is never printed.
    for (const k of ["status", "message", "errorCode", "requiredActions", "twoFactorMethods", "defaultMethod", "requirements"]) {
      if (r.body[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(r.body[k])}`);
    }
    if (r.body.challengeToken) console.log(`  challengeToken: <${typeof r.body.challengeToken}, ${String(r.body.challengeToken).length} chars>`);
  } else if (r.text) {
    console.log(`  body (non-JSON): ${r.text.slice(0, 120).replace(/\s+/g, " ")}`);
  }
  const t = r.body?.result?.accessToken ?? r.body?.result?.token ?? r.body?.accessToken;
  if (r.status === 200 && t) {
    token = t;
    base = b;
  }
  break;
}

if (!token) {
  console.log("\n❌ 所有登入嘗試都沒拿到 token。請把上面的輸出整段貼給 Claude。");
  process.exit(1);
}

console.log(`\n✅ 登入成功（${base}）。測試搜尋…`);
const s = await call(`${base}/player/v1.0/search`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query: "smith",
    limit: 2,
    offset: 0,
    exclude: [],
    includeUnclaimedPlayers: true,
    filter: { rating: { maxRating: null, minRating: null }, locationText: "" },
  }),
});
console.log(`POST /player/v1.0/search -> ${s.status}`);
const hit = s.body?.result?.hits?.[0];
console.log(`  result keys: ${keys(s.body?.result)}`);
if (hit) {
  console.log(`  hit keys:    ${keys(hit)}`);
  console.log(`  ratings:     ${JSON.stringify(hit.ratings)}`);
}
console.log("\n請把上面的輸出整段貼給 Claude（不含密碼與 token）。");
