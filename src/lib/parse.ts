/** Trim lines, drop blanks and duplicates (FRD 3.1.3 rule 1). */
export function parseEntries(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const value = firstColumn(line);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

/** Internal numeric player id (e.g. 4405492894). */
export const isNumericId = (s: string) => /^\d{5,}$/.test(s);
/** Public DUPR ID shown on profiles (e.g. "0YVNWN"): 6 chars, must contain a digit. */
export const isDuprId = (s: string) => /^[A-Za-z0-9]{6}$/.test(s) && /\d/.test(s);

/** First CSV column; a quoted field may contain commas and "" escapes. */
function firstColumn(line: string): string {
  const t = line.trim();
  if (t.startsWith('"')) {
    const m = t.match(/^"((?:[^"]|"")*)"/);
    if (m) return m[1].replace(/""/g, '"').trim();
  }
  return t.split(",")[0].trim();
}
