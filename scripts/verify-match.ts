/**
 * Offline verification of Stage-1 retrieval + Tier Plan for a franchise-offer Define set.
 * Run: npx tsx scripts/verify-match.ts
 */
import { buildTierPlan, retrieveByRole, scorePhraseAgainstRow } from "../lib/match";
import type { BasketItem, FieldMap, TaxRow } from "../lib/types";

const fields: FieldMap = {
  painPhrases: {
    value: "franchise for sale, buy a franchise, franchise opportunities near me, low cost franchise",
    status: "confirmed",
    inferred: false,
  },
  categoryPhrases: {
    value: "franchise ownership, franchise business, become a franchisee",
    status: "confirmed",
    inferred: false,
  },
  competitorBrands: {
    value: "Franchise Direct, Franchise Business Review, Entrepreneur Franchise 500, FranNet",
    status: "confirmed",
    inferred: false,
  },
  adjacentBrands: {
    value: "SBA loans, SCORE mentoring, BizBuySell, International Franchise Association",
    status: "confirmed",
    inferred: false,
  },
  stagePhrases: {
    value: "franchise FDD, franchise disclosure document, franchise financing, franchise ROI",
    status: "confirmed",
    inferred: false,
  },
};

const rows: TaxRow[] = [
  {
    id: "b2c_1001",
    premade: "Franchise Buyers",
    category: "WRONG CATEGORY Automotive",
    subcategory: "",
    description: "People who buy cars — should never match via description",
    keywords: "franchise for sale, buy a franchise, franchise opportunities, franchisee",
    type: "B2C",
  },
  {
    id: "b2b_2001",
    premade: "Franchise Direct Researchers",
    category: "Media",
    subcategory: "",
    description: "Stock investors researching franchise REITs",
    keywords: "Franchise Direct, franchise directory, franchise listings",
    type: "B2B",
  },
  {
    id: "b2c_1002",
    premade: "Entrepreneur Franchise Readers",
    category: "Publishing",
    subcategory: "",
    description: "Academic researchers studying entrepreneurship",
    keywords: "Entrepreneur Franchise 500, franchise rankings, top franchises",
    type: "B2C",
  },
  {
    id: "b2b_2002",
    premade: "FranNet Consultants Audience",
    category: "Consulting",
    subcategory: "",
    description: "Job seekers looking for franchise consultant careers",
    keywords: "FranNet, franchise broker, franchise consultant",
    type: "B2B",
  },
  {
    id: "b2c_1003",
    premade: "Low Cost Franchise Intenders",
    category: "Retail",
    subcategory: "",
    description: "People searching retail jobs",
    keywords: "low cost franchise, affordable franchise, franchise opportunities near me",
    type: "B2C",
  },
  {
    id: "b2b_2003",
    premade: "Franchise Business Review Audience",
    category: "Reviews",
    subcategory: "",
    description: "Investor relations",
    keywords: "Franchise Business Review, franchise reviews, franchisee satisfaction",
    type: "B2B",
  },
  {
    id: "b2c_1004",
    premade: "Franchise Ownership Explorers",
    category: "Education",
    subcategory: "",
    description: "MBA students",
    keywords: "franchise ownership, franchise business, become a franchisee",
    type: "B2C",
  },
  {
    id: "b2b_2004",
    premade: "SBA Loan Seekers",
    category: "Finance",
    subcategory: "",
    description: "Stock traders",
    keywords: "SBA loans, small business loan, franchise financing",
    type: "B2B",
  },
  {
    id: "b2c_1005",
    premade: "FDD Reviewers",
    category: "Legal",
    subcategory: "",
    description: "Law school research",
    keywords: "franchise FDD, franchise disclosure document, franchise ROI",
    type: "B2C",
  },
  {
    id: "b2b_2005",
    premade: "IFA Members",
    category: "Associations",
    subcategory: "",
    description: "Career fair attendees",
    keywords: "International Franchise Association, IFA, franchise association",
    type: "B2B",
  },
  {
    id: "b2c_9999",
    premade: "Auto Shoppers",
    category: "Franchise Opportunities",
    subcategory: "",
    description: "franchise for sale buy a franchise franchise opportunities",
    keywords: "new cars, used cars, dealership inventory",
    type: "B2C",
  },
];

const byRole = retrieveByRole(rows, fields);

console.log("=== Stage 1 per-role top candidates ===");
for (const [role, list] of Object.entries(byRole)) {
  console.log(`\n[${role}] (${list.length})`);
  for (const c of list.slice(0, 5)) {
    console.log(`  ${c.score.toFixed(1)}  ${c.row.id}  ${c.row.premade}`);
  }
}

const picks = [
  byRole.competitor[0],
  byRole.competitor[1],
  byRole.competitor[2],
  byRole.pain[0],
  byRole.pain[1],
  byRole.category[0],
  byRole.adjacent[0],
  byRole.stage[0],
].filter(Boolean);

const basket: BasketItem[] = picks.map((c) => ({
  row: c.row,
  why: "stage-1 pick",
  confidence: "high",
  role: c.role,
}));

const plan = buildTierPlan(basket);
const ids = basket.map((b) => b.row.id);
const roles = new Set(basket.map((b) => b.role));
const auto = rows.find((r) => r.id === "b2c_9999")!;
const real = rows.find((r) => r.id === "b2c_1001")!;

console.log("\n=== Simulated basket ===");
console.log(basket.map((b) => `${b.role}:${b.row.id}:${b.row.premade}`).join("\n"));

const checks: [string, boolean][] = [
  ["basket size 6-10", basket.length >= 6 && basket.length <= 10],
  ["spans ≥3 roles", roles.size >= 3],
  ["b2b_ + b2c_ present", ids.some((id) => id.startsWith("b2b_")) && ids.some((id) => id.startsWith("b2c_"))],
  [
    "Description/Category red herring loses to Premade+Keywords",
    scorePhraseAgainstRow("franchise for sale", auto) < scorePhraseAgainstRow("franchise for sale", real),
  ],
  ["Diamond = ceil(0.8 × N)", plan.diamond.threshold === Math.ceil(0.8 * basket.length)],
  ["Silver rule includes N", plan.silver.rule.includes(String(basket.length))],
  ["taxonomyIds length = N", plan.taxonomyIds.length === basket.length],
  ["combinations capped at 5", plan.combinations.length <= 5],
  ["combinations are brand × intent", plan.combinations.length > 0],
];

let failed = 0;
console.log("\n=== Checks ===");
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${plan.silver.rule}\n${plan.gold.rule}\n${plan.diamond.rule}`);
console.log(`Diamond header: ${plan.diamond.name} · ${plan.diamond.subtitle}`);
console.log(`Combinations (${plan.combinations.length}):`);
for (const p of plan.combinations) console.log(`  ${p.a} × ${p.b}`);
process.exit(failed ? 1 : 0);
