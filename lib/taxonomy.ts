import * as XLSX from "xlsx";
import type { TaxRow } from "./types";

const STOP = new Set([
  "the","and","for","are","but","not","you","your","with","this","that","from","have","has","was",
  "were","will","can","all","any","its","our","their","they","them","who","what","when","which",
  "into","over","more","most","other","such","than","then","also","been","being","about","only",
  "inc","llc","ltd","corp","company","companies","software","solutions","platform","platforms",
  "based","use","used","using","provides","provide","offers","offer","service","services",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/g)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ""))
    .filter((t) => t.length > 2 && t.length < 30 && !STOP.has(t));
}

function norm(h: string) {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

const HEADER_MAP: Record<string, keyof TaxRow> = {
  taxonomyid: "id",
  premade: "premade",
  category: "category",
  subcategory: "subcategory",
  premadedescription: "description",
  premadekeywords: "keywords",
  audiencetype: "type",
};

export async function parseTaxonomy(file: File): Promise<TaxRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!raw.length) return [];

  const keyLookup: Record<string, keyof TaxRow> = {};
  for (const header of Object.keys(raw[0])) {
    const mapped = HEADER_MAP[norm(header)];
    if (mapped) keyLookup[header] = mapped;
  }

  const rows: TaxRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const row: TaxRow = {
      id: "",
      premade: "",
      category: "",
      subcategory: "",
      description: "",
      keywords: "",
      type: "",
    };
    for (const header of Object.keys(r)) {
      const target = keyLookup[header];
      if (target) row[target] = String(r[header] ?? "").trim();
    }
    if (!row.id) row.id = `row_${i}`;
    if (row.premade) rows.push(row);
  }
  return rows;
}

export type Index = {
  postings: Map<string, number[]>;
  tf: Map<string, Map<number, number>>;
  len: Float32Array;
  avgdl: number;
  n: number;
};

/** Index/search text: Premade + Keywords only. Never Description/Category/Subcategory. */
function docText(r: TaxRow) {
  return `${r.premade} ${r.premade} ${r.keywords}`;
}

export function buildIndex(rows: TaxRow[]): Index {
  const postings = new Map<string, number[]>();
  const tf = new Map<string, Map<number, number>>();
  const len = new Float32Array(rows.length);
  let total = 0;

  for (let i = 0; i < rows.length; i++) {
    const tokens = tokenize(docText(rows[i]));
    len[i] = tokens.length;
    total += tokens.length;
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [term, count] of counts) {
      let p = postings.get(term);
      if (!p) {
        p = [];
        postings.set(term, p);
        tf.set(term, new Map());
      }
      p.push(i);
      tf.get(term)!.set(i, count);
    }
  }

  return {
    postings,
    tf,
    len,
    avgdl: rows.length ? total / rows.length : 0,
    n: rows.length,
  };
}

export function search(
  index: Index,
  rows: TaxRow[],
  query: string,
  k: number,
  typeFilter: string
): { row: TaxRow; score: number }[] {
  const k1 = 1.4;
  const b = 0.75;
  const qTokens = tokenize(query);
  const qCounts = new Map<string, number>();
  for (const t of qTokens) qCounts.set(t, (qCounts.get(t) ?? 0) + 1);

  const scores = new Map<number, number>();
  for (const [term, qCount] of qCounts) {
    const posting = index.postings.get(term);
    if (!posting) continue;
    if (posting.length > index.n * 0.35) continue;
    const idf = Math.log(1 + (index.n - posting.length + 0.5) / (posting.length + 0.5));
    const termTf = index.tf.get(term)!;
    for (const docId of posting) {
      const f = termTf.get(docId) ?? 0;
      const dl = index.len[docId] || 1;
      const score =
        idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / (index.avgdl || 1)))) * qCount;
      scores.set(docId, (scores.get(docId) ?? 0) + score);
    }
  }

  const out: { row: TaxRow; score: number }[] = [];
  for (const [docId, score] of scores) {
    const row = rows[docId];
    if (typeFilter !== "All" && row.type.toUpperCase() !== typeFilter.toUpperCase()) continue;
    out.push({ row, score });
  }
  out.sort((a, b2) => b2.score - a.score);
  return out.slice(0, k);
}
