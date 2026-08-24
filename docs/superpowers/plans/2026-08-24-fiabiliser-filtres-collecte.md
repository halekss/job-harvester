# Fiabiliser les filtres de collecte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une collecte lancée avec des filtres contrat/ville/métier ne retourne que des offres qui les respectent réellement, pour tous les connecteurs (tier0 et tier1) — plus aucun connecteur ne peut ignorer silencieusement un filtre.

**Architecture:** Un post-filtre centralisé (`packages/harvester/src/query-filter.ts`) appliqué juste après `normalize()` dans `runCampaign()`, pour tous les connecteurs. Complété par trois correctifs localisés : `inferContractTypeFromText` apprend "stage", Workday/SmartRecruiters cessent de câbler leur recherche/pré-filtre sur "alternance" en dur, France Travail lève une erreur explicite au lieu d'un `console.warn` silencieux. Plus deux correctifs de configuration/UI (ROME séparés, "Stage"/"Paris" dans l'UI).

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspaces (monorepo).

**Spec:** `docs/superpowers/specs/2026-08-24-fiabiliser-filtres-collecte-design.md`

## Global Constraints

- TDD pour chaque changement de code : test d'abord, échec constaté, implémentation minimale, succès constaté.
- Ne jamais retirer les pré-filtres mots-clés existants des 4 connecteurs tier1 (workday, smartrecruiters, talentsoft, digitalrecruiters) — ils restent utiles pour l'efficacité réseau, le filtre centralisé est un filet de sécurité final, pas un remplacement.
- Le filtre de localisation centralisé se construit à partir de **toutes** les localisations couvertes par le run (`locations`, calculé une fois avant la boucle dans `runCampaign`), jamais de la seule `query.location` de l'itération de boucle courante — voir le "piège identifié" dans la spec.
- Département non résolvable côté offre alors qu'un département EST attendu côté requête → offre exclue (fail-closed) avec `console.warn`, jamais incluse silencieusement.
- Département non résolvable côté requête (aucune localisation du run n'a de code postal dans son label) → aucune contrainte de localisation appliquée (ne pas fail-closed sur l'absence de contrainte elle-même).
- `normalizedCount` garde son sens actuel (nombre d'appels `normalize()` réussis) ; une offre rejetée par le filtre centralisé incrémente `rejectedCount`, pas `normalizedCount` — cohérent avec le sens déjà utilisé par les tests existants d'`orchestrator.test.ts`.
- Ne jamais committer de faux positif : chaque nouveau test doit échouer pour la bonne raison avant l'implémentation (RED réel).

---

### Task 1: `inferContractTypeFromText` reconnaît "stage" (JOB-72)

**Files:**
- Modify: `packages/core/src/text/infer-contract-type.ts`
- Test: `packages/core/src/text/infer-contract-type.test.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `inferContractTypeFromText(text: string): ContractType` peut désormais renvoyer `"stage"` — consommé par Task 2 (le filtre centralisé compare `offer.contractType` à `query.contractTypes`, qui peut désormais valoir `["stage"]` une fois Task 6 livrée côté UI).

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/core/src/text/infer-contract-type.test.ts` :

```ts
  it("detects stage", () => {
    expect(inferContractTypeFromText("Stage Data Analyst 6 mois")).toBe("stage");
    expect(inferContractTypeFromText("Stagiaire marketing H/F")).toBe("stage");
  });

  it("prefers apprentissage/professionnalisation over stage when both appear (unlikely but explicit)", () => {
    expect(inferContractTypeFromText("Contrat d'apprentissage, non un stage")).toBe("apprentissage");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/core exec vitest run infer-contract-type`
Expected: FAIL — `expect(inferContractTypeFromText("Stage Data Analyst 6 mois")).toBe("stage")` reçoit `"autre"` au lieu de `"stage"`.

- [ ] **Step 3: Write minimal implementation**

Dans `packages/core/src/text/infer-contract-type.ts`, ajouter une détection stage **avant** le repli `"autre"`, après les vérifications apprentissage/professionnalisation/alternance existantes (pour que le test "prefers apprentissage..." passe par construction, sans changer l'ordre des règles déjà en place) :

```ts
import type { ContractType } from "../schemas/normalized-offer.js";

export function inferContractTypeFromText(text: string): ContractType {
  if (/apprentissage/i.test(text)) return "apprentissage";
  if (/professionnalisation/i.test(text)) return "professionnalisation";
  // "alternance"/"alternant" is the generic French term covering both contract types below —
  // it doesn't itself specify which. Default to apprentissage (the more common of the two)
  // rather than losing the offer to "autre", which a strict-equality UI filter would exclude
  // entirely (JOB-33). Revisit if a source distinguishes the two more precisely.
  if (/alternan(t|ce)/i.test(text)) return "apprentissage";
  if (/\bstages?\b|stagiaire/i.test(text)) return "stage";
  return "autre";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/core exec vitest run infer-contract-type`
Expected: PASS — tous les tests du fichier, y compris les deux nouveaux.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/text/infer-contract-type.ts packages/core/src/text/infer-contract-type.test.ts
git commit -m "feat(core): inferContractTypeFromText reconnaît le stage (JOB-72)"
```

---

### Task 2: Créer `query-filter.ts` — le post-filtre centralisé (JOB-73, partie 1/2)

**Files:**
- Create: `packages/harvester/src/query-filter.ts`
- Test: `packages/harvester/src/query-filter.test.ts`

**Interfaces:**
- Consumes: `NormalizedOffer`, `ContractType` de `@job-harvester/core` ; `departmentFromPostalCode` de `@job-harvester/core` (déjà exporté, `packages/core/src/index.ts:11`).
- Produces:
  - `export interface QueryFilter { contractTypes: ContractType[]; keywords: string[]; acceptableDepartments: string[] }`
  - `export function offerMatchesQuery(offer: NormalizedOffer, filter: QueryFilter): boolean`
  - `export function departmentFromLabel(label: string): string | undefined`
  - `export function acceptableDepartmentsFromLocations(locations: { label: string }[]): string[]`

  Consommé par Task 3 (intégration dans `runCampaign()`) et par Task 8 (suite d'intégration bout-en-bout).

- [ ] **Step 1: Write the failing test**

Créer `packages/harvester/src/query-filter.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import type { NormalizedOffer } from "@job-harvester/core";
import { offerMatchesQuery, departmentFromLabel, acceptableDepartmentsFromLocations, type QueryFilter } from "./query-filter.js";

function makeOffer(overrides: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    id: "1",
    source: "fake",
    sourceOfferId: "1",
    canonicalUrl: "https://example.com/1",
    title: "Data Analyst",
    company: { name: "Acme", normalizedName: "acme" },
    location: { label: "Lille 59000", city: "Lille" },
    contractType: "apprentissage",
    romeCodes: [],
    descriptionText: "Poste en alternance chez Acme",
    firstSeenAt: "2026-08-24T00:00:00.000Z",
    lastSeenAt: "2026-08-24T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: "https://example.com/1",
    sourceRefs: [{ source: "fake", sourceOfferId: "1", canonicalUrl: "https://example.com/1" }],
    rawPayload: {},
    ...overrides,
  };
}

const permissiveFilter: QueryFilter = { contractTypes: [], keywords: [], acceptableDepartments: [] };

describe("departmentFromLabel", () => {
  it("extracts a department from a label containing a 5-digit postal code", () => {
    expect(departmentFromLabel("Lille 59000")).toBe("59");
    expect(departmentFromLabel("Paris 75000")).toBe("75");
  });

  it("returns undefined when the label has no postal code", () => {
    expect(departmentFromLabel("Lille")).toBeUndefined();
  });

  it("handles 3-digit DOM department codes (JOB-27 convention, reused via departmentFromPostalCode)", () => {
    expect(departmentFromLabel("Fort-de-France 97200")).toBe("972");
  });
});

describe("acceptableDepartmentsFromLocations", () => {
  it("returns the deduplicated set of departments across all locations", () => {
    expect(
      acceptableDepartmentsFromLocations([{ label: "Lille 59000" }, { label: "Amiens 80000" }, { label: "Paris 75000" }]),
    ).toEqual(["59", "80", "75"]);
  });

  it("skips locations with no resolvable department", () => {
    expect(acceptableDepartmentsFromLocations([{ label: "Lille" }, { label: "Amiens 80000" }])).toEqual(["80"]);
  });

  it("returns an empty array when no location has a resolvable department", () => {
    expect(acceptableDepartmentsFromLocations([{ label: "Lille" }])).toEqual([]);
  });
});

describe("offerMatchesQuery — contractTypes", () => {
  it("passes any contract type when contractTypes is empty", () => {
    expect(offerMatchesQuery(makeOffer({ contractType: "autre" }), permissiveFilter)).toBe(true);
  });

  it("rejects an offer whose contractType isn't in the filter", () => {
    const filter: QueryFilter = { ...permissiveFilter, contractTypes: ["stage"] };
    expect(offerMatchesQuery(makeOffer({ contractType: "apprentissage" }), filter)).toBe(false);
  });

  it("accepts an offer whose contractType is in the filter", () => {
    const filter: QueryFilter = { ...permissiveFilter, contractTypes: ["stage"] };
    expect(offerMatchesQuery(makeOffer({ contractType: "stage" }), filter)).toBe(true);
  });
});

describe("offerMatchesQuery — keywords", () => {
  it("passes any offer when keywords is empty", () => {
    expect(offerMatchesQuery(makeOffer({ title: "Développeur mobile", descriptionText: "" }), permissiveFilter)).toBe(true);
  });

  it("rejects an offer whose title/description don't match any keyword", () => {
    const filter: QueryFilter = { ...permissiveFilter, keywords: ["data"] };
    expect(offerMatchesQuery(makeOffer({ title: "Développeur mobile", descriptionText: "React Native" }), filter)).toBe(false);
  });

  it("accepts an offer matching a keyword on a word boundary, case-insensitive", () => {
    const filter: QueryFilter = { ...permissiveFilter, keywords: ["Data"] };
    expect(offerMatchesQuery(makeOffer({ title: "Alternance data analyst" }), filter)).toBe(true);
  });

  it("does not match a keyword as a substring inside an unrelated word", () => {
    const filter: QueryFilter = { ...permissiveFilter, keywords: ["BI"] };
    expect(offerMatchesQuery(makeOffer({ title: "Mobility manager", descriptionText: "" }), filter)).toBe(false);
  });
});

describe("offerMatchesQuery — location", () => {
  it("applies no location constraint when acceptableDepartments is empty", () => {
    const filter: QueryFilter = { ...permissiveFilter, acceptableDepartments: [] };
    expect(offerMatchesQuery(makeOffer({ location: { label: "Marseille 13000", city: "Marseille", department: "13" } }), filter)).toBe(
      true,
    );
  });

  it("accepts an offer whose department is in the acceptable set", () => {
    const filter: QueryFilter = { ...permissiveFilter, acceptableDepartments: ["59", "75"] };
    expect(offerMatchesQuery(makeOffer({ location: { label: "Paris 75000", city: "Paris", department: "75" } }), filter)).toBe(true);
  });

  it("rejects an offer whose department is outside the acceptable set", () => {
    const filter: QueryFilter = { ...permissiveFilter, acceptableDepartments: ["59", "75"] };
    expect(offerMatchesQuery(makeOffer({ location: { label: "Marseille 13000", city: "Marseille", department: "13" } }), filter)).toBe(
      false,
    );
  });

  it("fail-closed: rejects an offer with no resolvable department when a department constraint is active (Workday case)", () => {
    const filter: QueryFilter = { ...permissiveFilter, acceptableDepartments: ["59"] };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(offerMatchesQuery(makeOffer({ source: "workday", location: { label: "Lille", city: "Lille" } }), filter)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("workday"));
    warnSpy.mockRestore();
  });
});

describe("offerMatchesQuery — combined", () => {
  it("rejects on the first failing criterion even when others would pass", () => {
    const filter: QueryFilter = { contractTypes: ["stage"], keywords: ["data"], acceptableDepartments: ["59"] };
    expect(
      offerMatchesQuery(
        makeOffer({ contractType: "apprentissage", title: "Data Analyst", location: { label: "Lille 59000", city: "Lille", department: "59" } }),
        filter,
      ),
    ).toBe(false);
  });

  it("accepts an offer passing all three criteria", () => {
    const filter: QueryFilter = { contractTypes: ["apprentissage"], keywords: ["data"], acceptableDepartments: ["59"] };
    expect(
      offerMatchesQuery(
        makeOffer({ contractType: "apprentissage", title: "Data Analyst", location: { label: "Lille 59000", city: "Lille", department: "59" } }),
        filter,
      ),
    ).toBe(true);
  });
});
```

Ajouter `vi` à l'import vitest en tête de fichier : `import { describe, it, expect, vi } from "vitest";`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run query-filter`
Expected: FAIL — le module `./query-filter.js` n'existe pas encore (`Cannot find module`).

- [ ] **Step 3: Write minimal implementation**

Créer `packages/harvester/src/query-filter.ts` :

```ts
import { departmentFromPostalCode, type ContractType, type NormalizedOffer } from "@job-harvester/core";

export interface QueryFilter {
  contractTypes: ContractType[];
  keywords: string[];
  acceptableDepartments: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Backstop centralisé — même logique par limite de mot que les 4 pré-filtres tier1 (déjà
// dupliqués côté connecteurs pour l'efficacité réseau), appliquée ici pour tous les
// connecteurs, y compris tier0 qui n'a aujourd'hui aucun filtre mots-clés (JOB-73, ex JOB-68).
export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
}

// Même heuristique que francetravail/client.ts (code postal 5 chiffres dans le label), mais
// réutilise departmentFromPostalCode (déjà exporté par @job-harvester/core) pour gérer
// correctement les départements DOM/TOM à 3 chiffres — francetravail/client.ts a sa propre
// version simplifiée (slice(0,2) systématique), hors scope de ce lot.
export function departmentFromLabel(label: string): string | undefined {
  const match = label.match(/(\d{5})/);
  return match ? departmentFromPostalCode(match[1]!) : undefined;
}

// Calculé une fois par runCampaign(), à partir de TOUTES les localisations du run — pas de la
// query d'une seule itération de boucle (voir "piège identifié" dans la spec) : un connecteur
// locationScoped:false n'est fetché qu'une fois avec la première localisation, ses offres
// doivent quand même pouvoir matcher n'importe laquelle des localisations du run.
export function acceptableDepartmentsFromLocations(locations: { label: string }[]): string[] {
  const departments = new Set<string>();
  for (const location of locations) {
    const department = departmentFromLabel(location.label);
    if (department) departments.add(department);
  }
  return Array.from(departments);
}

export function offerMatchesQuery(offer: NormalizedOffer, filter: QueryFilter): boolean {
  if (filter.contractTypes.length > 0 && !filter.contractTypes.includes(offer.contractType)) {
    return false;
  }
  if (!matchesKeywords(`${offer.title} ${offer.descriptionText}`, filter.keywords)) {
    return false;
  }
  if (filter.acceptableDepartments.length > 0) {
    if (!offer.location.department) {
      console.warn(
        `[query-filter] offre "${offer.title}" (${offer.source}) exclue — aucun département résolu pour vérifier le filtre de localisation.`,
      );
      return false;
    }
    if (!filter.acceptableDepartments.includes(offer.location.department)) {
      return false;
    }
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run query-filter`
Expected: PASS — tous les tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/query-filter.ts packages/harvester/src/query-filter.test.ts
git commit -m "feat(harvester): ajoute query-filter.ts, le post-filtre centralisé (JOB-73 1/2)"
```

---

### Task 3: Intégrer `query-filter.ts` dans `runCampaign()` (JOB-73, partie 2/2)

**Files:**
- Modify: `packages/harvester/src/orchestrator.ts`
- Test: `packages/harvester/src/orchestrator.test.ts`

**Interfaces:**
- Consumes: `offerMatchesQuery`, `acceptableDepartmentsFromLocations` de `./query-filter.js` (Task 2).
- Produces: `runCampaign()` rejette désormais (via `rejectedCount`, sans exception) toute offre normalisée qui ne respecte pas `contractTypes`/`keywords`/localisation — comportement consommé implicitement par Task 8 (suite d'intégration) et par l'UI existante (`HarvestControl.tsx` affiche déjà `rejectedCount`, aucun changement requis côté UI pour ce ticket).

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/harvester/src/orchestrator.test.ts`, dans le `describe("runCampaign", ...)` existant (après les tests déjà présents) :

```ts
  it("rejects an offer whose contractType doesn't match the campaign's contractTypes, without upserting it (JOB-73)", async () => {
    const stageOffer: RawOffer = { source: "fake", payload: { id: "stage-1", url: "https://example.com/jobs/stage-1" } };
    const apprentissageOffer: RawOffer = { source: "fake", payload: { id: "appr-1", url: "https://example.com/jobs/appr-1" } };
    const mixedConnector: Connector = {
      id: "fake",
      tier: 0,
      supports: () => true,
      async *fetch() {
        yield stageOffer;
        yield apprentissageOffer;
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url: string };
        const offer = makeOffer(payload.id, payload.url);
        return { ...offer, contractType: payload.id === "stage-1" ? "stage" : "apprentissage" };
      },
      async healthCheck() {
        return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    // `campaign` (fixture partagée du fichier) a contractTypes: ["apprentissage"].
    const summary = await runCampaign(campaign, mixedConnector, db, {});

    expect(summary).toMatchObject({ rawCount: 2, normalizedCount: 2, rejectedCount: 1 });
    const stored = db.select().from(offersTable).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.contractType).toBe("apprentissage");
  });

  it("rejects an offer outside every location covered by the run, without upserting it (JOB-73)", async () => {
    const parisianCampaign: CampaignConfig = {
      ...campaign,
      locations: [
        { label: "Lille 59000", lat: 50.63, lng: 3.05, radiusKm: 30 },
        { label: "Paris 75000", lat: 48.8566, lng: 2.3522, radiusKm: 20 },
      ],
    };
    const marseilleOffer: RawOffer = { source: "fake", payload: { id: "mrs-1", url: "https://example.com/jobs/mrs-1" } };
    const parisOffer: RawOffer = { source: "fake", payload: { id: "par-1", url: "https://example.com/jobs/par-1" } };
    const geoConnector: Connector = {
      id: "fake",
      tier: 0,
      // locationScoped absent (undefined !== false) : se comporte comme location-scoped,
      // fetché à chaque itération de la boucle des localisations — les deux offres sont
      // donc yield à la même itération ici pour simplifier le test, peu importe pour ce
      // qui est vérifié (le filtre compare à l'ENSEMBLE des départements du run).
      supports: () => true,
      async *fetch() {
        yield marseilleOffer;
        yield parisOffer;
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url: string };
        const offer = makeOffer(payload.id, payload.url);
        return {
          ...offer,
          location:
            payload.id === "mrs-1"
              ? { label: "Marseille 13000", city: "Marseille", department: "13" }
              : { label: "Paris 75000", city: "Paris", department: "75" },
        };
      },
      async healthCheck() {
        return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    const summary = await runCampaign(parisianCampaign, geoConnector, db, {});

    // Le connecteur est locationScoped (pas false) donc fetché à chaque itération (2
    // localisations) : 2 appels x 2 offres yield = 4 raw au total, mais chaque offre est
    // traitée à chaque itération -> on ne vérifie ici que l'invariant qui importe : l'offre
    // parisienne survit (75 est dans locations), l'offre marseillaise est systématiquement
    // rejetée (13 n'y est jamais).
    const stored = db.select().from(offersTable).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.location).toMatchObject({ department: "75" });
    expect(summary.rejectedCount).toBeGreaterThan(0);
  });

  it("applies no location constraint when the campaign's locations have no resolvable department (back-compat with existing fixtures)", async () => {
    // La fixture `campaign` partagée du fichier a locations: [{label: "Lille", ...}] (sans code
    // postal) — ce test verrouille explicitement que ça n'active AUCUNE contrainte de
    // localisation, pour que le test historique "normalizes, dedups, and stores offers..."
    // (rawCount: 3, normalizedCount: 2, rejectedCount: 1) reste inchangé par ce ticket.
    const rawOffers: RawOffer[] = [{ source: "fake", payload: { id: "1", url: "https://example.com/jobs/1" } }];
    const fakeConnector: Connector = {
      id: "fake",
      tier: 0,
      supports: () => true,
      async *fetch() {
        for (const raw of rawOffers) yield raw;
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url: string };
        return makeOffer(payload.id, payload.url);
      },
      async healthCheck() {
        return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    const summary = await runCampaign(campaign, fakeConnector, db, {});

    expect(summary).toMatchObject({ rawCount: 1, normalizedCount: 1, rejectedCount: 0 });
    expect(db.select().from(offersTable).all()).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run orchestrator`
Expected: FAIL sur les deux premiers nouveaux tests (l'offre stage/marseillaise est upsertée alors qu'elle ne devrait pas l'être — `rejectedCount`/`stored.length` ne correspondent pas). Le 3ᵉ nouveau test doit déjà PASSER tel quel (comportement inchangé), confirmant qu'il verrouille bien un non-régression et pas un futur changement.

- [ ] **Step 3: Write minimal implementation**

Dans `packages/harvester/src/orchestrator.ts` :

```ts
import { ulid } from "ulid";
import { eq, and, or, desc } from "drizzle-orm";
import { isFuzzyDuplicate, mergeOffers, type Connector, type NormalizedOffer } from "@job-harvester/core";
import { offers as offersTable, connectorRuns, offerToRow, rowToOffer, type Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { createRateLimitedFetch } from "./rate-limit/rate-limited-fetch.js";
import { buildHarvestQuery, type HarvestOverrides } from "./build-harvest-query.js";
import { reportIncident, resolveIncidentIfHealthy } from "./linear/incident-reporter.js";
import { offerMatchesQuery, acceptableDepartmentsFromLocations } from "./query-filter.js";
```

(ajouter cette dernière ligne d'import après celle de `incident-reporter.js`, laisser le reste du fichier intact jusqu'à `runCampaign`).

Dans `runCampaign`, remplacer le corps de la boucle `for (const location of locations)` :

```ts
  // Filtre ville ad-hoc (JOB-audit-2026-08-21) : une seule localisation au lieu de la boucle sur
  // toutes celles de la campagne, quand l'utilisateur a choisi une ville pour cette collecte.
  const locations = overrides.location ? [overrides.location] : campaign.locations;
  // JOB-73 : calculé une fois pour TOUT le run, pas par itération — un connecteur
  // locationScoped:false n'est fetché qu'une fois avec la première localisation (voir plus
  // bas), ses offres doivent quand même pouvoir matcher n'importe laquelle des localisations
  // couvertes par ce run, pas seulement la première.
  const acceptableDepartments = acceptableDepartmentsFromLocations(locations);
  let hasFetchedOnce = false;
  for (const location of locations) {
    const query = buildHarvestQuery(campaign, location, overrides);
    if (!connector.supports(query)) continue;
    if (connector.locationScoped === false) {
      if (hasFetchedOnce) continue;
      hasFetchedOnce = true;
    }

    try {
      for await (const raw of connector.fetch(query, { fetchImpl: guardedFetch, env })) {
        rawCount += 1;
        try {
          const normalized = connector.normalize(raw);
          normalizedCount += 1;
          const matches = offerMatchesQuery(normalized, {
            contractTypes: query.contractTypes,
            keywords: query.keywords,
            acceptableDepartments,
          });
          if (!matches) {
            rejectedCount += 1;
            continue;
          }
          upsertOffer(db, normalized);
        } catch {
          rejectedCount += 1;
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }
```

(le reste de la fonction — construction de `runId`, insertion dans `connectorRuns`, appel à `evaluateConnectorHealth`, `return` — reste inchangé).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run orchestrator`
Expected: PASS — tous les tests du fichier, y compris les 3 nouveaux et tous les tests préexistants (en particulier le tout premier, `rawCount: 3, normalizedCount: 2, rejectedCount: 1`, doit rester identique).

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/orchestrator.ts packages/harvester/src/orchestrator.test.ts
git commit -m "feat(harvester): intègre le post-filtre centralisé dans runCampaign (JOB-73 2/2)"
```

---

### Task 4: Workday — dériver la recherche de `contractTypes` au lieu de "alternance" en dur (JOB-74, 1/2)

**Files:**
- Modify: `packages/connectors/src/tier1/workday/client.ts`
- Test: `packages/connectors/src/tier1/workday/client.test.ts`

**Interfaces:**
- Consumes: `ContractType` de `@job-harvester/core` (déjà importé indirectement via `HarvestQuery`).
- Produces: rien de nouveau consommé ailleurs — comportement interne à `fetchWorkdayOffers`.

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/connectors/src/tier1/workday/client.test.ts`, dans le `describe("fetchWorkdayOffers", ...)` existant :

```ts
  it("searches for 'stage' instead of 'alternance' when contractTypes is ['stage'] (JOB-74)", async () => {
    let searchBody: unknown;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        searchBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    const stageQuery: HarvestQuery = { ...query, contractTypes: ["stage"] };
    for await (const _item of fetchWorkdayOffers(stageQuery, { fetchImpl })) {
      // drain
    }

    expect(searchBody).toMatchObject({ searchText: "stage" });
  });

  it("searches with an empty searchText (no keyword constraint) when contractTypes is ['autre'] — no single reliable term exists", async () => {
    let searchBody: unknown;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        searchBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    const cdiQuery: HarvestQuery = { ...query, contractTypes: ["autre"] };
    for await (const _item of fetchWorkdayOffers(cdiQuery, { fetchImpl })) {
      // drain
    }

    expect(searchBody).toMatchObject({ searchText: "" });
  });

  it("still searches for 'alternance' when contractTypes is apprentissage/professionnalisation (back-compat)", async () => {
    let searchBody: unknown;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        searchBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    // `query` (fixture du fichier) a déjà contractTypes: ["apprentissage"].
    for await (const _item of fetchWorkdayOffers(query, { fetchImpl })) {
      // drain
    }

    expect(searchBody).toMatchObject({ searchText: "alternance" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors exec vitest run tier1/workday/client`
Expected: FAIL sur les deux premiers nouveaux tests (`searchText` vaut toujours `"alternance"`, jamais `"stage"` ni `""`). Le 3ᵉ nouveau test doit déjà PASSER (verrouille le comportement actuel pour ce cas).

- [ ] **Step 3: Write minimal implementation**

Dans `packages/connectors/src/tier1/workday/client.ts`, ajouter l'import de `ContractType` et une fonction de dérivation, puis l'utiliser dans `fetchWorkdayOffers` :

```ts
import { timedHealthCheck, stripHtml, type ConnectorHealth, type ContractType, type HarvestQuery, type WorkdayTarget } from "@job-harvester/core";
```

```ts
// JOB-74 : l'API Workday n'expose qu'une recherche texte libre (`searchText`), pas de filtre
// structuré par type de contrat. Un seul terme fiable existe par catégorie ; "autre" (CDI/CDD,
// catégorie fourre-tout) et les jeux de contractTypes mixtes n'ont pas de terme unique fiable —
// on préfère alors ne poser aucune contrainte de recherche (tout récupérer) et laisser le
// filtre centralisé (JOB-73, en aval dans runCampaign) trancher sur le contractType inféré par
// offre, plutôt que de deviner un mot-clé qui exclurait des résultats à tort.
function searchTextForContractTypes(contractTypes: ContractType[]): string {
  if (contractTypes.length === 0) return "";
  if (contractTypes.every((type) => type === "apprentissage" || type === "professionnalisation")) return "alternance";
  if (contractTypes.every((type) => type === "stage")) return "stage";
  return "";
}
```

Puis dans `fetchWorkdayOffers`, remplacer :

```ts
    const listItems = await fetchJobList(target, "alternance", fetchImpl);
```

par :

```ts
    const listItems = await fetchJobList(target, searchTextForContractTypes(query.contractTypes), fetchImpl);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors exec vitest run tier1/workday/client`
Expected: PASS — tous les tests du fichier.

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/tier1/workday/client.ts packages/connectors/src/tier1/workday/client.test.ts
git commit -m "fix(connectors): workday dérive sa recherche de contractTypes au lieu de 'alternance' en dur (JOB-74 1/2)"
```

---

### Task 5: SmartRecruiters — dériver le pré-filtre de `contractTypes` au lieu de "alternance" en dur (JOB-74, 2/2)

**Files:**
- Modify: `packages/connectors/src/tier1/smartrecruiters/client.ts`
- Test: `packages/connectors/src/tier1/smartrecruiters/client.test.ts`

**Interfaces:**
- Consumes: `ContractType` de `@job-harvester/core`.
- Produces: rien de nouveau consommé ailleurs — comportement interne à `fetchSmartRecruitersOffers`.

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/connectors/src/tier1/smartrecruiters/client.test.ts`, dans le `describe("fetchSmartRecruitersOffers", ...)` existant :

```ts
  it("keeps postings whose name mentions 'stage' when contractTypes is ['stage'], drops alternance-only ones (JOB-74)", async () => {
    const detailUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Stage Data Analyst H/F" },
              { id: "2", name: "Alternance Data Analyst H/F" },
            ],
            totalFound: 2,
          }),
          { status: 200 },
        );
      }
      detailUrls.push(url);
      return new Response(JSON.stringify({ id: "1", name: "Stage Data Analyst H/F" }), { status: 200 });
    });

    const stageQuery: HarvestQuery = { ...query, contractTypes: ["stage"] };
    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(stageQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(detailUrls[0]).toContain("/postings/1");
  });

  it("keeps every posting (no client-side contract pre-filter) when contractTypes is ['autre'] — no single reliable term exists", async () => {
    const detailUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Comptable H/F" },
              { id: "2", name: "Alternance Data Analyst H/F" },
            ],
            totalFound: 2,
          }),
          { status: 200 },
        );
      }
      detailUrls.push(url);
      return new Response(JSON.stringify({ id: "1", name: "Comptable H/F" }), { status: 200 });
    });

    const cdiQuery: HarvestQuery = { ...query, contractTypes: ["autre"] };
    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(cdiQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors exec vitest run tier1/smartrecruiters/client`
Expected: FAIL sur le 1er nouveau test (le posting "Stage Data Analyst H/F" est rejeté par `isAlternanceRelevant`, qui ne reconnaît que alternance/apprentissage/apprenti — `results` a longueur 0, pas 1). Le 2ᵉ nouveau test échoue aussi (le posting "Comptable H/F" est actuellement rejeté par le hardcoding alternance — `results` a longueur 1, pas 2).

- [ ] **Step 3: Write minimal implementation**

Dans `packages/connectors/src/tier1/smartrecruiters/client.ts`, remplacer l'import et la fonction `isAlternanceRelevant` :

```ts
import { timedHealthCheck, stripHtml, type ConnectorHealth, type ContractType, type HarvestQuery } from "@job-harvester/core";
```

```ts
// JOB-74 : le nom de la fiche (seul champ disponible avant de fetcher le détail) ne permet
// qu'une heuristique texte, pas un vrai filtre structuré. "autre" (CDI/CDD, catégorie
// fourre-tout) et les jeux de contractTypes mixtes n'ont pas de terme unique fiable — on
// préfère alors ne poser aucune contrainte (tout garder pour fetch du détail) et laisser le
// filtre centralisé (JOB-73, en aval dans runCampaign) trancher sur le contractType inféré une
// fois le détail récupéré, plutôt que de deviner un mot-clé qui exclurait des résultats à tort.
function matchesContractTypesHint(text: string, contractTypes: ContractType[]): boolean {
  if (contractTypes.length === 0) return true;
  if (contractTypes.every((type) => type === "apprentissage" || type === "professionnalisation")) {
    return /alternance|apprentissage|apprenti/i.test(text);
  }
  if (contractTypes.every((type) => type === "stage")) {
    return /\bstages?\b|stagiaire/i.test(text);
  }
  return true;
}
```

Puis dans `fetchSmartRecruitersOffers`, remplacer :

```ts
      if (!listing.id || !isAlternanceRelevant(listing.name ?? "")) continue;
```

par :

```ts
      if (!listing.id || !matchesContractTypesHint(listing.name ?? "", query.contractTypes)) continue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors exec vitest run tier1/smartrecruiters/client`
Expected: PASS — tous les tests du fichier, y compris le test préexistant "filters out non-alternance postings before fetching their detail" (qui utilise `query` avec `contractTypes: ["apprentissage"]`, donc toujours couvert par la branche alternance de `matchesContractTypesHint`).

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/tier1/smartrecruiters/client.ts packages/connectors/src/tier1/smartrecruiters/client.test.ts
git commit -m "fix(connectors): smartrecruiters dérive son pré-filtre de contractTypes au lieu de 'alternance' en dur (JOB-74 2/2)"
```

---

### Task 6: France Travail — erreur explicite au lieu du `console.warn` silencieux (JOB-64)

**Files:**
- Modify: `packages/connectors/src/tier0/francetravail/client.ts`
- Test: `packages/connectors/src/tier0/francetravail/client.test.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `fetchFranceTravailOffers` lève désormais une exception (au lieu de continuer silencieusement) quand `query.location.label` n'a pas de code postal exploitable — comportement déjà géré par la route API/le connecteur (`try/catch` implicite via `runCampaign`, déjà testé Task 3) : se traduit par `RunSummary.ok === false` et un message d'erreur visible côté UI, sans changement requis ailleurs.

- [ ] **Step 1: Write the failing test**

Remplacer le test existant (autour de la ligne 231) dans `packages/connectors/src/tier0/francetravail/client.test.ts` :

```ts
  it("warns and omits the departement filter when the location label has no postal code (JOB-23)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const noPostalCodeQuery: HarvestQuery = { ...query, location: { ...query.location, label: "Lille" } };
    let searchUrl = "";
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      searchUrl = url;
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    for await (const _item of fetchFranceTravailOffers(noPostalCodeQuery, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      // drain
    }

    expect(new URL(searchUrl).searchParams.has("departement")).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Lille"));
    warnSpy.mockRestore();
  });
```

par :

```ts
  it("throws an explicit error instead of silently falling back to a national search when the location label has no postal code (JOB-64)", async () => {
    const noPostalCodeQuery: HarvestQuery = { ...query, location: { ...query.location, label: "Lille" } };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    const iterator = fetchFranceTravailOffers(noPostalCodeQuery, { clientId: "cid", clientSecret: "csecret", fetchImpl });
    await expect(iterator.next()).rejects.toThrow(/Lille/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors exec vitest run tier0/francetravail/client`
Expected: FAIL — `iterator.next()` résout normalement (l'itération se termine sans lever, la recherche nationale silencieuse a bien lieu) au lieu de rejeter.

- [ ] **Step 3: Write minimal implementation**

Dans `packages/connectors/src/tier0/francetravail/client.ts`, remplacer le bloc :

```ts
function buildSearchUrl(query: Pick<HarvestQuery, "location" | "romeCodes">): URL {
  const url = new URL(SEARCH_URL);
  if (query.romeCodes.length > 0) {
    url.searchParams.set("codeROME", query.romeCodes.join(","));
  }
  const departement = extractDepartement(query.location.label);
  if (departement) {
    url.searchParams.set("departement", departement);
  } else {
    // JOB-23 : sans code postal dans le label de localisation, la recherche devient nationale
    // au lieu d'être géo-filtrée — un avertissement visible vaut mieux qu'une perte silencieuse.
    console.warn(
      `francetravail: aucun code postal trouvé dans le label de localisation "${query.location.label}" — recherche non filtrée par département.`,
    );
  }
  return url;
}
```

par :

```ts
function buildSearchUrl(query: Pick<HarvestQuery, "location" | "romeCodes">): URL {
  const url = new URL(SEARCH_URL);
  if (query.romeCodes.length > 0) {
    url.searchParams.set("codeROME", query.romeCodes.join(","));
  }
  const departement = extractDepartement(query.location.label);
  if (!departement) {
    // JOB-64 : un console.warn seul laissait passer une recherche nationale non bornée sans
    // que personne ne le voie jamais (pas de trace côté UI/résumé de collecte) — lever une
    // erreur explicite est l'un des deux comportements que la DoD accepte ("refus de lancer la
    // recherche pour ce connecteur"), et se traduit par un ✗ échec visible dans le résumé de
    // collecte via le try/catch déjà en place dans runCampaign (JOB-22).
    throw new Error(
      `francetravail: aucun code postal trouvé dans le label de localisation "${query.location.label}" — recherche refusée plutôt que non bornée silencieusement.`,
    );
  }
  url.searchParams.set("departement", departement);
  return url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors exec vitest run tier0/francetravail/client`
Expected: PASS — tous les tests du fichier. Vérifier en particulier qu'aucun autre test existant ne dépendait du comportement "recherche nationale silencieuse" (le seul test qui le faisait est celui remplacé à l'étape 1).

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/tier0/francetravail/client.ts packages/connectors/src/tier0/francetravail/client.test.ts
git commit -m "fix(connectors): francetravail refuse la recherche au lieu d'un repli national silencieux (JOB-64)"
```

---

### Task 7: Séparer les ROME partagés entre les deux campagnes (JOB-67, couvre aussi JOB-71)

**Files:**
- Modify: `config/campaigns.yaml`

**Interfaces:**
- Consumes: rien.
- Produces: rien consommé programmatiquement — fichier de configuration lu par `packages/harvester/src/config/load-campaigns.js` (inchangé).

Pas de test automatisé possible sur un fichier YAML de configuration statique (pas de schéma qui interdirait un ROME partagé — c'est une convention, pas une contrainte technique). Vérification manuelle à la place du cycle TDD habituel.

- [ ] **Step 1: Modifier `config/campaigns.yaml`**

Dans la section `alternance-data-hdf`, remplacer :

```yaml
    romeCodes: [M1403, M1805]
```

par :

```yaml
    romeCodes: [M1403]
```

Ne rien changer à `alternance-devweb-hdf` (garde `romeCodes: [M1802, M1805, M1811]` — `M1805` est le ROME générique développement, légitimement à sa place ici).

- [ ] **Step 2: Vérifier qu'aucune autre paire de campagnes ne partage un ROME ambigu (JOB-71)**

Le fichier ne contient que ces deux campagnes à ce jour (vérifié 2026-08-24). Confirmer par lecture directe du fichier après modification qu'aucun code ROME n'apparaît dans les deux listes `romeCodes` à la fois :

```bash
python3 -c "
import yaml
data = yaml.safe_load(open('config/campaigns.yaml'))
romes = [set(c['romeCodes']) for c in data['campaigns']]
shared = romes[0] & romes[1]
print('ROME partagés :', shared or 'aucun')
"
```

Expected: `ROME partagés : aucun` (si `python3`/`pyyaml` n'est pas disponible dans l'environnement, faire cette vérification par lecture visuelle du fichier — deux listes de 6 codes ROME au total, trivial à comparer à l'œil).

- [ ] **Step 3: Run test to verify nothing broke**

Run: `pnpm --filter @job-harvester/harvester exec vitest run` (les tests de `load-campaigns`/`campaign-schema` ne dépendent pas des valeurs ROME spécifiques, seulement de la structure — doivent rester verts).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add config/campaigns.yaml
git commit -m "fix(config): retire le ROME générique partagé M1805 de la campagne data (JOB-67)"
```

---

### Task 8: UI — ajouter "Stage" au filtre Contrat et "Paris" au filtre Ville (JOB-62, JOB-63)

**Files:**
- Modify: `packages/web/src/components/HarvestControl.tsx`
- Test: `packages/web/src/components/HarvestControl.test.tsx`

**Interfaces:**
- Consumes: rien de nouveau (le type `HarvestFilters` de `../api/client.js` accepte déjà `contractTypes: string[]` et `location: {...}` sans changement de schéma).
- Produces: rien consommé ailleurs.

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/web/src/components/HarvestControl.test.tsx`, dans le `describe("HarvestControl — ad-hoc filters", ...)` existant :

```ts
  it("sends contractTypes: ['stage'] when Contrat=Stage is selected (JOB-62)", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.selectOptions(screen.getByLabelText("Contrat"), "Stage");
    await user.click(screen.getByRole("button", { name: /Lancer la collecte/ }));

    await waitFor(() => {
      const harvestCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      expect(harvestCall).toBeDefined();
      const body = JSON.parse(String(harvestCall![1]?.body ?? "{}"));
      expect(body).toMatchObject({ contractTypes: ["stage"] });
    });
  });

  it("sends the Paris location when Ville=Paris is selected (JOB-63)", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.selectOptions(screen.getByLabelText("Ville"), "Paris");
    await user.click(screen.getByRole("button", { name: /Lancer la collecte/ }));

    await waitFor(() => {
      const harvestCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      expect(harvestCall).toBeDefined();
      const body = JSON.parse(String(harvestCall![1]?.body ?? "{}"));
      expect(body).toMatchObject({ location: { label: "Paris 75000", lat: 48.8566, lng: 2.3522, radiusKm: 20 } });
    });
  });
```

Vérifier au préalable (lecture du fichier) le nom exact des `label`/`role` utilisés par les tests déjà présents dans ce fichier pour rester cohérent (le fichier utilise déjà `screen.getByLabelText("Contrat")`/`"Ville"` et `screen.getByRole("button", { name: /Lancer la collecte/ })` dans ses tests existants — réutiliser ces mêmes sélecteurs).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/web exec vitest run HarvestControl`
Expected: FAIL sur les deux nouveaux tests — `user.selectOptions(..., "Stage")`/`"Paris"` échoue car ces options n'existent pas encore dans les `<select>`.

- [ ] **Step 3: Write minimal implementation**

Dans `packages/web/src/components/HarvestControl.tsx`, modifier les deux constantes :

```ts
// JOB-audit-2026-08-21 : filtres ad-hoc du bouton "Lancer la collecte" - remplacent les champs
// correspondants de la campagne pour CETTE collecte uniquement, sans jamais toucher
// campaigns.yaml. "Alternance" = les deux contrats concernés ; CDI/CDD sont indissociables
// pour le système aujourd'hui (aucun connecteur ne distingue les deux), donc les deux
// retombent sur "autre" - décision assumée, gardés comme deux options distinctes dans l'UI.
const CONTRACT_OPTIONS: Record<string, string[]> = {
  Alternance: ["apprentissage", "professionnalisation"],
  CDI: ["autre"],
  CDD: ["autre"],
  Stage: ["stage"],
};

// Mêmes coordonnées/rayon que config/campaigns.yaml - une seule localisation au lieu de
// boucler sur toutes celles de la campagne.
const CITY_LOCATIONS: Record<string, { label: string; lat: number; lng: number; radiusKm: number }> = {
  Lille: { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  Amiens: { label: "Amiens 80000", lat: 49.903041, lng: 2.292605, radiusKm: 30 },
  Paris: { label: "Paris 75000", lat: 48.8566, lng: 2.3522, radiusKm: 20 },
};
```

Puis, dans le JSX, ajouter les deux `<option>` correspondantes :

```tsx
          <select
            value={contract}
            onChange={(event) => setContract(event.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
          >
            <option value="">Tous</option>
            <option value="Alternance">Alternance</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Stage">Stage</option>
          </select>
```

```tsx
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
          >
            <option value="">Toutes</option>
            <option value="Lille">Lille</option>
            <option value="Amiens">Amiens</option>
            <option value="Paris">Paris</option>
          </select>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/web exec vitest run HarvestControl`
Expected: PASS — tous les tests du fichier, y compris les tests préexistants (aucune option retirée, seulement ajoutée).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/HarvestControl.tsx packages/web/src/components/HarvestControl.test.tsx
git commit -m "feat(web): ajoute Stage au filtre Contrat et Paris au filtre Ville (JOB-62, JOB-63)"
```

---

### Task 9: Suite d'intégration bout-en-bout — la DoD vérifiée sur un mélange de connecteurs (JOB-70)

**Files:**
- Create: `packages/harvester/src/query-filter.integration.test.ts`

**Interfaces:**
- Consumes: `runCampaignAcrossConnectors` de `./orchestrator.js`, `type Connector` de `@job-harvester/core` — construit des connecteurs simulés représentant un mélange tier0/tier1, exactement comme le fait déjà `orchestrator.test.ts` pour un seul connecteur à la fois.
- Produces: rien consommé ailleurs — fichier de test uniquement, garde-fou de non-régression pur.

Ce fichier est volontairement séparé d'`orchestrator.test.ts` (déjà modifié par Task 3) pour éviter que deux tâches ne touchent le même fichier de test et se marchent dessus. Il reproduit le scénario exact du bug rapporté : `Contrat=Alternance, Ville=Lille, campagne=alternance-data-hdf` ne doit renvoyer que des offres d'alternance, à Lille, cohérentes avec le métier data — sur un mélange de connecteurs représentatifs (un tier0-like sans filtre propre, un tier1-like `locationScoped:false`).

- [ ] **Step 1: Write the failing test**

Créer `packages/harvester/src/query-filter.integration.test.ts` :

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, offers as offersTable } from "@job-harvester/db";
import type { Connector, NormalizedOffer, RawOffer } from "@job-harvester/core";
import { exactDedupKeyFromUrl } from "@job-harvester/core";
import { runCampaignAcrossConnectors } from "./orchestrator.js";
import type { CampaignConfig } from "./config/campaign-schema.js";

vi.mock("./linear/client.js", () => ({
  searchIssueByTitle: vi.fn(async () => []),
  createIssue: vi.fn(async () => ({ id: "linear-issue-1", identifier: "ENG-1", title: "mock", state: { name: "Backlog" } })),
  commentOnIssue: vi.fn(async () => undefined),
  transitionIssueState: vi.fn(async () => undefined),
}));

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-queryfilter-integration-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function makeOffer(id: string, canonicalUrl: string, overrides: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    id,
    source: "fake",
    sourceOfferId: id,
    canonicalUrl,
    title: "Data Analyst",
    company: { name: "Acme", normalizedName: "acme" },
    location: { label: "Lille 59000", city: "Lille", department: "59" },
    contractType: "apprentissage",
    romeCodes: ["M1403"],
    descriptionText: "Poste en alternance data chez Acme",
    firstSeenAt: "2026-08-24T00:00:00.000Z",
    lastSeenAt: "2026-08-24T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: "fake", sourceOfferId: id, canonicalUrl }],
    rawPayload: {},
    ...overrides,
  };
}

// Reproduit alternance-data-hdf : contrat alternance, une seule ville (Lille), mots-clés data.
const dataCampaign: CampaignConfig = {
  id: "alternance-data-hdf",
  romeCodes: ["M1403"],
  keywords: ["data"],
  locations: [{ label: "Lille 59000", lat: 50.63, lng: 3.05, radiusKm: 30 }],
  contractTypes: ["apprentissage", "professionnalisation"],
};

describe("query-filter integration — DoD scenario (JOB-70)", () => {
  it("returns only alternance, Lille-department, data-relevant offers across a mix of tier0-like and tier1-like connectors", async () => {
    // tier0-like : aucun filtre propre, comme francetravail/labonnealternance avant JOB-73 —
    // renvoie tout ce qu'on lui donne, le filtre centralisé doit tout trancher.
    const tier0Like: Connector = {
      id: "tier0-fake",
      tier: 0,
      supports: () => true,
      async *fetch(): AsyncIterable<RawOffer> {
        yield { source: "tier0-fake", payload: { id: "data-ok", url: "https://example.com/tier0/data-ok" } };
        yield { source: "tier0-fake", payload: { id: "devweb-offtopic", url: "https://example.com/tier0/devweb" } };
        yield { source: "tier0-fake", payload: { id: "cdi-wrong-contract", url: "https://example.com/tier0/cdi" } };
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url: string };
        if (payload.id === "devweb-offtopic") {
          return makeOffer(payload.id, payload.url, { title: "Développeur mobile", descriptionText: "React Native, Kotlin" });
        }
        if (payload.id === "cdi-wrong-contract") {
          return makeOffer(payload.id, payload.url, { contractType: "autre" });
        }
        return makeOffer(payload.id, payload.url);
      },
      async healthCheck() {
        return { connectorId: "tier0-fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    // tier1-like locationScoped:false : un seul fetch, offres de villes variées — doit être
    // filtré sur le DÉPARTEMENT de la campagne (59, Lille), pas seulement sur son propre avis.
    const tier1Like: Connector = {
      id: "tier1-fake",
      tier: 1,
      locationScoped: false,
      supports: () => true,
      async *fetch(): AsyncIterable<RawOffer> {
        yield { source: "tier1-fake", payload: { id: "lille-ok", url: "https://example.com/tier1/lille-ok" } };
        yield { source: "tier1-fake", payload: { id: "marseille-offtopic", url: "https://example.com/tier1/marseille" } };
        yield { source: "tier1-fake", payload: { id: "no-department", url: "https://example.com/tier1/no-dept" } };
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url: string };
        if (payload.id === "marseille-offtopic") {
          return makeOffer(payload.id, payload.url, { location: { label: "Marseille 13000", city: "Marseille", department: "13" } });
        }
        if (payload.id === "no-department") {
          // Cas Workday : pas de département résolu du tout -> fail-closed attendu.
          return makeOffer(payload.id, payload.url, { location: { label: "Lille", city: "Lille" } });
        }
        return makeOffer(payload.id, payload.url);
      },
      async healthCheck() {
        return { connectorId: "tier1-fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    await runCampaignAcrossConnectors(dataCampaign, [tier0Like, tier1Like], db, {});

    const stored = db.select().from(offersTable).all();
    const storedIds = stored.map((row) => row.sourceOfferId).sort();

    expect(storedIds).toEqual(["data-ok", "lille-ok"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run query-filter.integration`
Expected: **PASS directement si Tasks 1-3 sont déjà committées** (ce test vérifie un comportement déjà implémenté par Task 3, il ne s'agit pas d'une nouvelle fonctionnalité mais d'un garde-fou de bout en bout). Si ce test échoue à ce stade, c'est le signal qu'une régression a été introduite entre Task 3 et maintenant (Tasks 4-8 ne devraient rien changer à ce comportement) — dans ce cas, NE PAS modifier ce test pour le faire passer : investiguer quelle tâche précédente a régressé.

- [ ] **Step 3: (rien à implémenter — ce test verrouille un comportement déjà livré)**

Si le test échoue de façon inattendue, relire `packages/harvester/src/orchestrator.ts` (Task 3) et `packages/harvester/src/query-filter.ts` (Task 2) pour identifier l'écart avant de toucher quoi que ce soit d'autre.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run query-filter.integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/query-filter.integration.test.ts
git commit -m "test(harvester): suite d'intégration bout-en-bout du filtre centralisé (JOB-70)"
```

---

## Vérification finale (à la fin de Task 9, avant la revue de branche)

Run: `pnpm -r run test` puis `pnpm -r run typecheck` — les deux doivent passer sur les 6 packages, aucune régression sur les ~295 tests préexistants avant ce plan.
