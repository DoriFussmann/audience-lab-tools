/**
 * Client-side fusion logic checks (no network).
 * Run: npx tsx scripts/verify-fusion.ts
 */
import {
  attachedAudiencesHaveDisjointGeography,
  buildFusionCsv,
  deriveGeoState,
  filterLeadsByGeoState,
  fuseLeads,
  fuseResultFromLeads,
  fusionPairIds,
  geoStateCounts,
  parseLeadCsv,
  rolePoints,
  type RawLead,
} from "../lib/fusion";
import { buildTierPlan } from "../lib/match";
import type { BasketItem, TaxRow } from "../lib/types";

function tax(id: string, premade: string): TaxRow {
  return {
    id,
    premade,
    category: "",
    subcategory: "",
    description: "",
    keywords: "",
    type: "",
  };
}

function item(
  id: string,
  premade: string,
  role: BasketItem["role"]
): BasketItem {
  return {
    row: tax(id, premade),
    why: "",
    confidence: "high",
    role,
  };
}

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

const basket: BasketItem[] = [
  item("tax-comp-1", "Franchises", "competitor"),
  item("tax-cat-1", "Franchises", "category"), // same premade name, different ID
  item("tax-pain-1", "SBA Loans", "pain"),
  item("tax-adj-1", "Adjacent Brand", "adjacent"),
];

const pairs = fusionPairIds(basket);
// brand: competitor + adjacent; intent: category + pain → 2×2 = 4 pairs by ID
assert(pairs.length === 4, `pair count by taxonomy ID (got ${pairs.length})`);
assert(
  pairs.every((p) => p.a.startsWith("tax-") && p.b.startsWith("tax-")),
  "pairs use taxonomy IDs not premade names"
);
assert(rolePoints("pain") === 30, "pain = 30");
assert(rolePoints("competitor") === 40, "competitor = 40");

const fileA = {
  taxonomyId: "tax-comp-1",
  rows: [
    {
      UUID: "u-1",
      FIRST_NAME: "Ada",
      LAST_NAME: "Lovelace",
      COMPANY_NAME: "Analytical",
      PERSONAL_VERIFIED_EMAILS: "ada@example.com",
      MOBILE_PHONE: "555-0100",
      SKIPTRACE_MATCH_SCORE: "8",
    },
    {
      UUID: "u-2",
      FIRST_NAME: "Grace",
      LAST_NAME: "Hopper",
      COMPANY_NAME: "Navy",
      BUSINESS_VERIFIED_EMAILS: "grace@navy.test",
    },
  ] as RawLead[],
};

const fileB = {
  taxonomyId: "tax-cat-1",
  rows: [
    {
      UUID: "u-1",
      FIRST_NAME: "Ada",
      LAST_NAME: "Lovelace",
      COMPANY_NAME: "Analytical Engines",
      JOB_TITLE: "Mathematician",
      PERSONAL_VERIFIED_EMAILS: "ada@example.com",
    },
    {
      UUID: "u-3",
      FIRST_NAME: "Alan",
      LAST_NAME: "Turing",
      COMPANY_NAME: "Bletchley",
      BUSINESS_EMAIL: "alan@bletchley.test",
    },
  ] as RawLead[],
};

// Shared email, different UUIDs + different names — must NOT merge
const emailCollision = {
  taxonomyId: "tax-pain-1",
  rows: [
    {
      UUID: "u-email-a",
      FIRST_NAME: "Pat",
      LAST_NAME: "One",
      PERSONAL_VERIFIED_EMAILS: "shared@home.test",
      COMPANY_NAME: "A",
    },
    {
      UUID: "u-email-b",
      FIRST_NAME: "Pat",
      LAST_NAME: "Two",
      PERSONAL_VERIFIED_EMAILS: "shared@home.test",
      COMPANY_NAME: "B",
    },
  ] as RawLead[],
};

const plan = buildTierPlan(basket);
const result = fuseLeads(basket, [fileA, fileB, emailCollision], plan);

const ada = result.leads.find((l) => l.fields.UUID === "u-1");
assert(!!ada, "Ada found");
assert(ada!.audienceIds.length === 2, `Ada in 2 audiences (got ${ada?.audienceIds.length})`);
assert(ada!.tier === "Gold", `Ada is Gold (got ${ada?.tier})`);
assert(
  (ada!.fields.JOB_TITLE || "") === "Mathematician",
  "Ada merged JOB_TITLE from second file"
);

const silvers = result.leads.filter((l) => l.tier === "Silver");
assert(
  ada!.fusionScore > Math.max(...silvers.map((s) => s.fusionScore), 0),
  "Ada outranks Silvers"
);

const patOne = result.leads.find((l) => l.fields.UUID === "u-email-a");
const patTwo = result.leads.find((l) => l.fields.UUID === "u-email-b");
assert(!!patOne && !!patTwo, "email-sharing different UUIDs remain separate");
assert(
  patOne!.audienceIds.length === 1 && patTwo!.audienceIds.length === 1,
  "email-only collision did not merge"
);

// Quoted multiline CSV
const quoted = parseLeadCsv(
  `UUID,FIRST_NAME,LAST_NAME,BUSINESS_EMAIL,NOTES
"q-1","Multi","Line","m@test.com","line1
line2"`
);
assert(quoted.ok, "quoted multiline parses");
if (quoted.ok) {
  assert(quoted.rows.length === 1, "one row from quoted multiline");
  assert(
    (quoted.rows[0].NOTES || "").includes("line1"),
    "multiline field preserved"
  );
}

const bad = parseLeadCsv(`foo,bar\n1,2`);
assert(!bad.ok, "non-lead CSV rejected");
if (!bad.ok) assert(bad.error.includes("email") || bad.error.includes("name"), "reject reason");

const csv = buildFusionCsv(result.leads, basket, 2, false);
assert(
  csv.startsWith("RANK,FUSION_SCORE,TIER,AUDIENCE_COUNT,GEO_STATE,AUDIENCES"),
  "export headers"
);
assert(!csv.includes("SKIPTRACE_ETHNIC_CODE"), "excluded columns absent by default");
const lines = csv.trim().split(/\r?\n/);
assert(lines.length === 3, `top-2 export has header+2 rows (got ${lines.length})`);

// Geo derivation
assert(deriveGeoState({ PERSONAL_STATE: "ca" }) === "CA", "personal state uppercased");
assert(
  deriveGeoState({ COMPANY_STATE: "tx" }) === "TX",
  "company state used when personal missing"
);
assert(
  deriveGeoState({ PERSONAL_STATE: "ca", COMPANY_STATE: "ny" }) === "CA",
  "personal preferred over company"
);
assert(deriveGeoState({}) === "Unknown", "missing state → Unknown");
assert(
  deriveGeoState({ PERSONAL_STATE: "California" }) === "California",
  "non-code kept raw"
);

// Mixed-state fixture → filter recount correct
const mixedGeo = {
  taxonomyId: "tax-comp-1",
  rows: [
    {
      UUID: "geo-ca-1",
      FIRST_NAME: "Cal",
      LAST_NAME: "One",
      PERSONAL_STATE: "ca",
      PERSONAL_VERIFIED_EMAILS: "cal1@ex.test",
    },
    {
      UUID: "geo-ca-2",
      FIRST_NAME: "Cal",
      LAST_NAME: "Two",
      COMPANY_STATE: "CA",
      BUSINESS_EMAIL: "cal2@ex.test",
    },
    {
      UUID: "geo-ny-1",
      FIRST_NAME: "Ny",
      LAST_NAME: "One",
      PERSONAL_STATE: "ny",
      BUSINESS_EMAIL: "ny1@ex.test",
    },
  ] as RawLead[],
};
const mixedGeoB = {
  taxonomyId: "tax-cat-1",
  rows: [
    {
      UUID: "geo-ca-1",
      FIRST_NAME: "Cal",
      LAST_NAME: "One",
      PERSONAL_STATE: "CA",
      PERSONAL_VERIFIED_EMAILS: "cal1@ex.test",
    },
  ] as RawLead[],
};
const mixedResult = fuseLeads(basket, [mixedGeo, mixedGeoB], plan);
const counts = geoStateCounts(mixedResult.leads);
const caCount = counts.find((c) => c.state === "CA")?.count || 0;
const nyCount = counts.find((c) => c.state === "NY")?.count || 0;
assert(caCount === 2, `mixed CA count (got ${caCount})`);
assert(nyCount === 1, `mixed NY count (got ${nyCount})`);
const caOnly = fuseResultFromLeads(filterLeadsByGeoState(mixedResult.leads, "CA"));
assert(caOnly.total === 2, `CA filter total (got ${caOnly.total})`);
assert(
  caOnly.leads.every((l) => l.geoState === "CA"),
  "CA filter only CA leads"
);
const caCsv = buildFusionCsv(caOnly.leads, basket, 10, false);
const caLines = caCsv.trim().split(/\r?\n/);
assert(caLines.length === 3, `CA export re-ranks top within filter (got ${caLines.length - 1} rows)`);
assert(caLines[1].startsWith("1,"), "filtered rank 1 is first");

// Disjoint-geo fixture triggers the warning line
const westAud = {
  taxonomyId: "tax-comp-1",
  rows: [
    { UUID: "w1", FIRST_NAME: "W", LAST_NAME: "1", PERSONAL_STATE: "CA", BUSINESS_EMAIL: "w1@t.com" },
    { UUID: "w2", FIRST_NAME: "W", LAST_NAME: "2", PERSONAL_STATE: "OR", BUSINESS_EMAIL: "w2@t.com" },
    { UUID: "w3", FIRST_NAME: "W", LAST_NAME: "3", PERSONAL_STATE: "WA", BUSINESS_EMAIL: "w3@t.com" },
  ] as RawLead[],
};
const eastAud = {
  taxonomyId: "tax-cat-1",
  rows: [
    { UUID: "e1", FIRST_NAME: "E", LAST_NAME: "1", PERSONAL_STATE: "NY", BUSINESS_EMAIL: "e1@t.com" },
    { UUID: "e2", FIRST_NAME: "E", LAST_NAME: "2", PERSONAL_STATE: "NJ", BUSINESS_EMAIL: "e2@t.com" },
    { UUID: "e3", FIRST_NAME: "E", LAST_NAME: "3", PERSONAL_STATE: "MA", BUSINESS_EMAIL: "e3@t.com" },
  ] as RawLead[],
};
assert(
  attachedAudiencesHaveDisjointGeography([westAud, eastAud]),
  "disjoint top-5 states → geography mismatch warning"
);
assert(
  !attachedAudiencesHaveDisjointGeography([mixedGeo, mixedGeoB]),
  "overlapping CA audiences → no mismatch warning"
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll fusion checks passed.");
