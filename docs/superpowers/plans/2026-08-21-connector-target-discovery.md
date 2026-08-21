# Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À chaque collecte manuelle, sonder les entreprises déjà en base jamais testées sur Workday/SmartRecruiters/Talentsoft/DigitalRecruiters, et ajouter automatiquement à `campaigns.yaml` celles qui y sont confirmées.

**Architecture:** Un nouveau module `packages/harvester/src/discovery/` avec une fonction de sondage par plateforme (devine un slug/domaine, vérifie en direct), un orchestrateur qui plafonne à 20 entreprises jamais sondées par run et écrit les résultats dans une nouvelle table `discovery_probes` (jamais deux fois la même entreprise/plateforme) et dans `campaigns.yaml`. Branché après `runCampaignAcrossConnectors` dans la route `POST /harvest/:campaignId/run`, uniquement sur déclenchement manuel (jamais sur le cron).

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Zod, Vitest, Hono, React/Vitest Testing Library, `yaml` (déjà en dépendance).

**Spec:** `docs/superpowers/specs/2026-08-21-connector-target-discovery-design.md`

## Global Constraints

- Sondage uniquement sur clic manuel "Lancer la collecte" — jamais sur le cron 7h (`packages/harvester/src/scheduler.ts` n'est pas touché par ce plan).
- Plafond de 20 nouvelles entreprises (jamais dans `discovery_probes`) sondées par lancement.
- Une entreprise/plateforme n'est jamais sondée deux fois — vérifié via la table `discovery_probes` avant tout sondage.
- Workday : seulement `dc` ∈ {wd1, wd3, wd5} testés (3 tentatives max), jamais plus.
- Talentsoft : jusqu'à 5 domaines candidats testés, arrêt au premier succès confirmé par les marqueurs de plateforme (pas juste un HTTP 200).
- Une découverte confirmée est ajoutée à `targets.<platform>` des DEUX campagnes dans `campaigns.yaml`, jamais dupliquée si déjà présente.
- Robots.txt vérifié uniquement pour le sondage Talentsoft (page HTML) — pas pour Workday/SmartRecruiters/DigitalRecruiters (API JSON pures), cohérent avec le comportement des connecteurs réels existants.
- Les cibles découvertes pendant un run ne s'appliquent qu'aux runs suivants (le fichier n'est relu qu'au prochain chargement) — comportement assumé, pas un bug.

---

## Task 1: Table `discovery_probes`

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: migration via `drizzle-kit generate` (fichier généré sous `packages/db/migrations/`)

**Interfaces:**
- Produces: export `discoveryProbes` (table Drizzle) depuis `@job-harvester/db` (déjà réexporté automatiquement via `packages/db/src/index.ts` → `export * from "./schema.js"`). Colonnes : `id` (text, PK), `companySlug` (text, not null), `platform` (text, not null), `found` (integer/boolean, not null), `target` (text/json, nullable), `probedAt` (text, not null).

- [ ] **Step 1: Ajouter la table dans le schéma**

Ajouter à la fin de `packages/db/src/schema.ts` :

```ts
export const discoveryProbes = sqliteTable("discovery_probes", {
  id: text("id").primaryKey(),
  companySlug: text("company_slug").notNull(),
  platform: text("platform").notNull(),
  found: integer("found", { mode: "boolean" }).notNull(),
  target: text("target", { mode: "json" }).$type<string | { tenant: string; site: string; dc: string }>(),
  probedAt: text("probed_at").notNull(),
});
```

- [ ] **Step 2: Générer la migration**

Run: `pnpm --filter @job-harvester/db run migrate:generate`
Expected: un nouveau fichier `packages/db/migrations/000N_xxxx.sql` contenant `CREATE TABLE discovery_probes (...)`.

- [ ] **Step 3: Vérifier que les migrations s'appliquent proprement**

Run: `pnpm --filter @job-harvester/db exec vitest run`
Expected: PASS (les tests existants créent une DB fraîche à chaque run, donc la nouvelle migration s'applique automatiquement).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @job-harvester/db run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations
git commit -m "feat(db): ajoute la table discovery_probes"
```

---

## Task 2: Dépendance `@job-harvester/connectors` dans `harvester`

**Files:**
- Modify: `packages/harvester/package.json`

**Interfaces:**
- Produces: `packages/harvester` peut désormais importer `isAllowedByRobots` et `USER_AGENT` depuis `@job-harvester/connectors`.

- [ ] **Step 1: Ajouter la dépendance**

Dans `packages/harvester/package.json`, dans `"dependencies"`, ajouter :

```json
"@job-harvester/connectors": "workspace:*",
```

- [ ] **Step 2: Installer**

Run: `pnpm install`
Expected: pas d'erreur, `packages/harvester/node_modules/@job-harvester/connectors` résolu vers le workspace.

- [ ] **Step 3: Vérifier qu'il n'y a pas de dépendance circulaire**

Run: `grep -n "@job-harvester/harvester" packages/connectors/package.json`
Expected: aucune sortie (pas de dépendance dans l'autre sens).

- [ ] **Step 4: Commit**

```bash
git add packages/harvester/package.json pnpm-lock.yaml
git commit -m "chore(harvester): ajoute la dépendance vers connectors (réutilisation robots.txt/user-agent)"
```

---

## Task 3: Génération de slug d'entreprise

**Files:**
- Create: `packages/harvester/src/discovery/slug.ts`
- Test: `packages/harvester/src/discovery/slug.test.ts`

**Interfaces:**
- Consumes: `normalizeCompanyName` depuis `@job-harvester/core` (déjà existant — minuscules, accents retirés, suffixes légaux `sasu/sas/sarl/eurl/sa/sci/scop/groupe/group` retirés, tokens joints par un espace).
- Produces: `companySlug(companyName: string): string` — même normalisation, tokens joints par un tiret (`"Crédit Agricole"` → `"credit-agricole"`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { companySlug } from "./slug.js";

describe("companySlug", () => {
  it("lowercases, strips accents, and joins words with hyphens", () => {
    expect(companySlug("Crédit Agricole")).toBe("credit-agricole");
  });

  it("strips common legal suffixes", () => {
    expect(companySlug("Décathlon Group")).toBe("decathlon");
  });

  it("strips parenthetical content via non-alphanumeric stripping", () => {
    expect(companySlug("Abeille Assurances (Aéma Groupe)")).toBe("abeille-assurances-aema");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/slug.test.ts`
Expected: FAIL avec "Cannot find module './slug.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { normalizeCompanyName } from "@job-harvester/core";

export function companySlug(companyName: string): string {
  return normalizeCompanyName(companyName).replace(/\s+/g, "-");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/slug.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/slug.ts packages/harvester/src/discovery/slug.test.ts
git commit -m "feat(harvester): génération de slug d'entreprise pour la découverte de cibles"
```

---

## Task 4: Sondage DigitalRecruiters

**Files:**
- Create: `packages/harvester/src/discovery/probe-digitalrecruiters.ts`
- Test: `packages/harvester/src/discovery/probe-digitalrecruiters.test.ts`

**Interfaces:**
- Consumes: `USER_AGENT` depuis `@job-harvester/connectors`.
- Produces: `probeDigitalRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined>` — retourne le domaine `joinus.{slug}.fr` si confirmé, sinon `undefined`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { probeDigitalRecruiters } from "./probe-digitalrecruiters.js";

describe("probeDigitalRecruiters", () => {
  it("returns the joinus domain when the API confirms a real customer (count present)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain("domainName=joinus.yzee-services.fr");
      return new Response(JSON.stringify({ count: 3, items: [] }), { status: 200 });
    });

    const result = await probeDigitalRecruiters("yzee-services", fetchImpl);

    expect(result).toBe("joinus.yzee-services.fr");
  });

  it("returns undefined when the API rejects the domain (HTTP 400)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("bad domain", { status: 400 }));

    const result = await probeDigitalRecruiters("not-a-real-company", fetchImpl);

    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-digitalrecruiters.test.ts`
Expected: FAIL avec "Cannot find module './probe-digitalrecruiters.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { USER_AGENT } from "@job-harvester/connectors";

export async function probeDigitalRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const domain = `joinus.${slug}.fr`;
  const url = `https://api.digitalrecruiters.com/public/v1/careers-site/job-ads?domainName=${encodeURIComponent(domain)}&limit=1&page=1&locale=fr_FR`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: {}, coordinates: { lat: 0, lng: 0 } }),
  });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { count?: unknown };
  if (typeof body.count !== "number") return undefined;
  return domain;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-digitalrecruiters.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/probe-digitalrecruiters.ts packages/harvester/src/discovery/probe-digitalrecruiters.test.ts
git commit -m "feat(harvester): sondage DigitalRecruiters pour la découverte de cibles"
```

---

## Task 5: Sondage SmartRecruiters

**Files:**
- Create: `packages/harvester/src/discovery/probe-smartrecruiters.ts`
- Test: `packages/harvester/src/discovery/probe-smartrecruiters.test.ts`

**Interfaces:**
- Consumes: `USER_AGENT` depuis `@job-harvester/connectors`.
- Produces: `probeSmartRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined>` — retourne le slug en majuscules (ex. `"MAZARS"`) si confirmé, sinon `undefined`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { probeSmartRecruiters } from "./probe-smartrecruiters.js";

describe("probeSmartRecruiters", () => {
  it("returns the uppercased company slug when the postings endpoint responds ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain("/companies/MAZARS/postings");
      return new Response(JSON.stringify({ content: [] }), { status: 200 });
    });

    const result = await probeSmartRecruiters("mazars", fetchImpl);

    expect(result).toBe("MAZARS");
  });

  it("returns undefined when the company is unknown (HTTP 404)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 }));

    const result = await probeSmartRecruiters("not-a-real-company", fetchImpl);

    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-smartrecruiters.test.ts`
Expected: FAIL avec "Cannot find module './probe-smartrecruiters.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { USER_AGENT } from "@job-harvester/connectors";

export async function probeSmartRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const company = slug.toUpperCase();
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=1`;
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) return undefined;
  return company;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-smartrecruiters.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/probe-smartrecruiters.ts packages/harvester/src/discovery/probe-smartrecruiters.test.ts
git commit -m "feat(harvester): sondage SmartRecruiters pour la découverte de cibles"
```

---

## Task 6: Sondage Talentsoft

**Files:**
- Create: `packages/harvester/src/discovery/probe-talentsoft.ts`
- Test: `packages/harvester/src/discovery/probe-talentsoft.test.ts`

**Interfaces:**
- Consumes: `isAllowedByRobots`, `USER_AGENT` depuis `@job-harvester/connectors`.
- Produces: `probeTalentsoft(slug: string, fetchImpl: typeof fetch): Promise<string | undefined>` — teste jusqu'à 5 domaines candidats, retourne le premier confirmé (marqueurs de plateforme présents), sinon `undefined`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { probeTalentsoft } from "./probe-talentsoft.js";

const talentsoftHtml = `<html><body>__VIEWSTATE talentsoft <a href="Pages/x.aspx">link</a></body></html>`;

describe("probeTalentsoft", () => {
  it("returns the first candidate domain that responds ok and carries Talentsoft markers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === "https://recrutement.acme.fr/") return new Response("not talentsoft", { status: 200 });
      if (url === "https://acme-recrute.talent-soft.com/") return new Response(talentsoftHtml, { status: 200 });
      return new Response("nope", { status: 404 });
    });

    const result = await probeTalentsoft("acme", fetchImpl);

    expect(result).toBe("acme-recrute.talent-soft.com");
  });

  it("returns undefined when none of the candidate domains carry Talentsoft markers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      return new Response("nothing here", { status: 200 });
    });

    const result = await probeTalentsoft("not-a-talentsoft-company", fetchImpl);

    expect(result).toBeUndefined();
  });

  it("skips a candidate domain disallowed by robots.txt without fetching its root page", async () => {
    const rootCalls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(["User-agent: *", "Disallow: /"].join("\n"), { status: 200 });
      rootCalls.push(url);
      return new Response(talentsoftHtml, { status: 200 });
    });

    const result = await probeTalentsoft("acme", fetchImpl);

    expect(result).toBeUndefined();
    expect(rootCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-talentsoft.test.ts`
Expected: FAIL avec "Cannot find module './probe-talentsoft.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { isAllowedByRobots, USER_AGENT } from "@job-harvester/connectors";

function candidateDomains(slug: string): string[] {
  return [
    `recrutement.${slug}.fr`,
    `${slug}-recrute.talent-soft.com`,
    `${slug}-career.talent-soft.com`,
    `${slug}-cand.talent-soft.com`,
    `${slug}.talent-soft.com`,
  ];
}

function looksLikeTalentsoft(html: string): boolean {
  return /__VIEWSTATE|talentsoft/i.test(html);
}

export async function probeTalentsoft(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  for (const domain of candidateDomains(slug)) {
    const rootUrl = `https://${domain}/`;
    const allowed = await isAllowedByRobots(rootUrl, USER_AGENT, fetchImpl);
    if (!allowed) continue;
    try {
      const response = await fetchImpl(rootUrl, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) continue;
      const html = await response.text();
      if (looksLikeTalentsoft(html)) return domain;
    } catch {
      continue;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-talentsoft.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/probe-talentsoft.ts packages/harvester/src/discovery/probe-talentsoft.test.ts
git commit -m "feat(harvester): sondage Talentsoft pour la découverte de cibles"
```

---

## Task 7: Sondage Workday

**Files:**
- Create: `packages/harvester/src/discovery/probe-workday.ts`
- Test: `packages/harvester/src/discovery/probe-workday.test.ts`

**Interfaces:**
- Consumes: `USER_AGENT` depuis `@job-harvester/connectors`; `WorkdayTarget` depuis `@job-harvester/core`.
- Produces: `probeWorkday(slug: string, fetchImpl: typeof fetch): Promise<WorkdayTarget | undefined>` — teste `dc` ∈ {wd1, wd3, wd5}, retourne `{tenant, site, dc}` au premier succès (`site` deviné par convention `{tenant}_jobs`), sinon `undefined`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { probeWorkday } from "./probe-workday.js";

describe("probeWorkday", () => {
  it("returns {tenant, site, dc} for the first dc that responds ok", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://acme.wd3.myworkdayjobs.com/")) {
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await probeWorkday("acme", fetchImpl);

    expect(result).toEqual({ tenant: "acme", site: "acme_jobs", dc: "wd3" });
    // wd1 tenté et échoué avant wd3 (ordre respecté)
    expect(requestedUrls[0]).toContain(".wd1.");
  });

  it("returns undefined when none of wd1/wd3/wd5 respond ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 }));

    const result = await probeWorkday("not-a-real-tenant", fetchImpl);

    expect(result).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("strips hyphens from the slug to build the tenant (Workday tenants are compact alphanumeric)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://creditagricole.wd1.myworkdayjobs.com/")) {
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await probeWorkday("credit-agricole", fetchImpl);

    expect(result).toEqual({ tenant: "creditagricole", site: "creditagricole_jobs", dc: "wd1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-workday.test.ts`
Expected: FAIL avec "Cannot find module './probe-workday.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { USER_AGENT } from "@job-harvester/connectors";
import type { WorkdayTarget } from "@job-harvester/core";

const DC_CANDIDATES = ["wd1", "wd3", "wd5"];

export async function probeWorkday(slug: string, fetchImpl: typeof fetch): Promise<WorkdayTarget | undefined> {
  const tenant = slug.replace(/-/g, "");
  const site = `${tenant}_jobs`;
  for (const dc of DC_CANDIDATES) {
    const url = `https://${tenant}.${dc}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
      });
      if (response.ok) return { tenant, site, dc };
    } catch {
      continue;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/probe-workday.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/probe-workday.ts packages/harvester/src/discovery/probe-workday.test.ts
git commit -m "feat(harvester): sondage Workday pour la découverte de cibles"
```

---

## Task 8: Écriture des cibles découvertes dans campaigns.yaml

**Files:**
- Create: `packages/harvester/src/discovery/write-campaigns-yaml.ts`
- Test: `packages/harvester/src/discovery/write-campaigns-yaml.test.ts`

**Interfaces:**
- Consumes: `parse`, `stringify` depuis `yaml` (déjà une dépendance de `packages/harvester`).
- Produces: `addTargetToCampaigns(filePath: string, platform: "workday" | "smartrecruiters" | "talentsoft" | "digitalRecruiters", target: string | { tenant: string; site: string; dc: string }): void` — ajoute la cible à `targets.<platform>` de CHAQUE campagne du fichier, sans dupliquer si déjà présente, et réécrit le fichier.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { addTargetToCampaigns } from "./write-campaigns-yaml.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpCampaignsFile(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "campaigns.yaml");
  writeFileSync(filePath, yaml, "utf-8");
  return filePath;
}

const baseYaml = `campaigns:
  - id: campaign-a
    romeCodes: [M1403]
    keywords: ["data"]
    locations: []
    contractTypes: [apprentissage]
    targets:
      smartrecruiters: ["EXISTING"]
  - id: campaign-b
    romeCodes: [M1802]
    keywords: ["dev"]
    locations: []
    contractTypes: [apprentissage]
`;

describe("addTargetToCampaigns", () => {
  it("adds the target to targets.<platform> of every campaign, creating targets/platform lists as needed", () => {
    const filePath = tmpCampaignsFile(baseYaml);

    addTargetToCampaigns(filePath, "digitalRecruiters", "joinus.acme.fr");

    const written = parse(readFileSync(filePath, "utf-8")) as { campaigns: Array<{ targets?: Record<string, unknown[]> }> };
    expect(written.campaigns[0]!.targets!.digitalRecruiters).toEqual(["joinus.acme.fr"]);
    expect(written.campaigns[0]!.targets!.smartrecruiters).toEqual(["EXISTING"]);
    expect(written.campaigns[1]!.targets!.digitalRecruiters).toEqual(["joinus.acme.fr"]);
  });

  it("does not duplicate a target that is already present", () => {
    const filePath = tmpCampaignsFile(baseYaml);

    addTargetToCampaigns(filePath, "smartrecruiters", "EXISTING");

    const written = parse(readFileSync(filePath, "utf-8")) as { campaigns: Array<{ targets?: Record<string, unknown[]> }> };
    expect(written.campaigns[0]!.targets!.smartrecruiters).toEqual(["EXISTING"]);
  });

  it("supports an object target (Workday {tenant, site, dc})", () => {
    const filePath = tmpCampaignsFile(baseYaml);

    addTargetToCampaigns(filePath, "workday", { tenant: "acme", site: "acme_jobs", dc: "wd1" });

    const written = parse(readFileSync(filePath, "utf-8")) as { campaigns: Array<{ targets?: Record<string, unknown[]> }> };
    expect(written.campaigns[0]!.targets!.workday).toEqual([{ tenant: "acme", site: "acme_jobs", dc: "wd1" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/write-campaigns-yaml.test.ts`
Expected: FAIL avec "Cannot find module './write-campaigns-yaml.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";

export type DiscoveryPlatform = "workday" | "smartrecruiters" | "talentsoft" | "digitalRecruiters";
export type DiscoveryTarget = string | { tenant: string; site: string; dc: string };

interface CampaignsFileShape {
  campaigns: Array<{ targets?: Record<string, unknown[]> }>;
}

export function addTargetToCampaigns(filePath: string, platform: DiscoveryPlatform, target: DiscoveryTarget): void {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as CampaignsFileShape;

  for (const campaign of parsed.campaigns) {
    campaign.targets ??= {};
    const list = (campaign.targets[platform] ??= []);
    const alreadyPresent = list.some((existing) => JSON.stringify(existing) === JSON.stringify(target));
    if (!alreadyPresent) list.push(target);
  }

  writeFileSync(filePath, stringify(parsed));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/write-campaigns-yaml.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/write-campaigns-yaml.ts packages/harvester/src/discovery/write-campaigns-yaml.test.ts
git commit -m "feat(harvester): écriture des cibles découvertes dans campaigns.yaml"
```

---

## Task 9: Orchestrateur `discoverTargets`

**Files:**
- Create: `packages/harvester/src/discovery/discover-targets.ts`
- Test: `packages/harvester/src/discovery/discover-targets.test.ts`

**Interfaces:**
- Consumes: `offers`, `discoveryProbes`, `type Db` depuis `@job-harvester/db` ; `companySlug` (Task 3) ; `probeDigitalRecruiters`/`probeSmartRecruiters`/`probeTalentsoft`/`probeWorkday` (Tasks 4-7) ; `addTargetToCampaigns` (Task 8) ; `ulid` depuis `ulid`.
- Produces:
  ```ts
  export interface DiscoveredTarget {
    companySlug: string;
    platform: "workday" | "smartrecruiters" | "talentsoft" | "digitalRecruiters";
    target: string | { tenant: string; site: string; dc: string };
  }
  export interface DiscoverySummary {
    probed: number;
    found: DiscoveredTarget[];
  }
  export interface DiscoverTargetsOptions {
    fetchImpl?: typeof fetch;
    limit?: number;
  }
  export async function discoverTargets(db: Db, campaignsFilePath: string, options?: DiscoverTargetsOptions): Promise<DiscoverySummary>
  ```
  `limit` par défaut 20 (voir Global Constraints).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { createDb, offers as offersTable, discoveryProbes, offerToRow } from "@job-harvester/db";
import { exactDedupKeyFromUrl, type NormalizedOffer } from "@job-harvester/core";
import { discoverTargets } from "./discover-targets.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-db-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function tmpCampaignsFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-yaml-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "campaigns.yaml");
  writeFileSync(
    filePath,
    `campaigns:
  - id: campaign-a
    romeCodes: [M1403]
    keywords: ["data"]
    locations: []
    contractTypes: [apprentissage]
`,
    "utf-8",
  );
  return filePath;
}

function makeOffer(companyName: string, canonicalUrl: string): NormalizedOffer {
  return {
    id: canonicalUrl,
    source: "fake",
    sourceOfferId: canonicalUrl,
    canonicalUrl,
    title: "Job",
    company: { name: companyName, normalizedName: companyName.toLowerCase() },
    location: { label: "Lille", city: "Lille" },
    contractType: "apprentissage",
    romeCodes: [],
    descriptionText: "desc",
    firstSeenAt: "2026-08-21T00:00:00.000Z",
    lastSeenAt: "2026-08-21T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: "fake", sourceOfferId: canonicalUrl, canonicalUrl }],
    rawPayload: {},
  };
}

describe("discoverTargets", () => {
  it("probes only companies never seen in discovery_probes, records every result, and writes confirmed targets to campaigns.yaml", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(makeOffer("Acme", "https://example.com/1"))).run();
    const campaignsFilePath = tmpCampaignsFile();

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("digitalrecruiters.com")) return new Response(JSON.stringify({ count: 5 }), { status: 200 });
      return new Response("nope", { status: 404 });
    });

    const summary = await discoverTargets(db, campaignsFilePath, { fetchImpl });

    expect(summary.probed).toBe(1);
    expect(summary.found).toEqual([{ companySlug: "acme", platform: "digitalRecruiters", target: "joinus.acme.fr" }]);

    const probes = db.select().from(discoveryProbes).all();
    expect(probes).toHaveLength(4); // une ligne par plateforme, trouvée ou pas

    const written = parse(readFileSync(campaignsFilePath, "utf-8")) as { campaigns: Array<{ targets?: { digitalRecruiters?: string[] } }> };
    expect(written.campaigns[0]!.targets!.digitalRecruiters).toEqual(["joinus.acme.fr"]);
  });

  it("never re-probes a company already present in discovery_probes", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(makeOffer("Acme", "https://example.com/1"))).run();
    const campaignsFilePath = tmpCampaignsFile();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 404 }));

    await discoverTargets(db, campaignsFilePath, { fetchImpl });
    const summary = await discoverTargets(db, campaignsFilePath, { fetchImpl });

    expect(summary.probed).toBe(0);
  });

  it("caps the number of newly-probed companies at the given limit", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(makeOffer("Acme One", "https://example.com/1"))).run();
    db.insert(offersTable).values(offerToRow(makeOffer("Acme Two", "https://example.com/2"))).run();
    db.insert(offersTable).values(offerToRow(makeOffer("Acme Three", "https://example.com/3"))).run();
    const campaignsFilePath = tmpCampaignsFile();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 404 }));

    const summary = await discoverTargets(db, campaignsFilePath, { fetchImpl, limit: 2 });

    expect(summary.probed).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/discover-targets.test.ts`
Expected: FAIL avec "Cannot find module './discover-targets.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { ulid } from "ulid";
import { offers as offersTable, discoveryProbes, type Db } from "@job-harvester/db";
import { companySlug } from "./slug.js";
import { probeDigitalRecruiters } from "./probe-digitalrecruiters.js";
import { probeSmartRecruiters } from "./probe-smartrecruiters.js";
import { probeTalentsoft } from "./probe-talentsoft.js";
import { probeWorkday } from "./probe-workday.js";
import { addTargetToCampaigns, type DiscoveryPlatform, type DiscoveryTarget } from "./write-campaigns-yaml.js";

const DEFAULT_LIMIT = 20;

export interface DiscoveredTarget {
  companySlug: string;
  platform: DiscoveryPlatform;
  target: DiscoveryTarget;
}

export interface DiscoverySummary {
  probed: number;
  found: DiscoveredTarget[];
}

export interface DiscoverTargetsOptions {
  fetchImpl?: typeof fetch;
  limit?: number;
}

function recordProbe(db: Db, slug: string, platform: DiscoveryPlatform, target: DiscoveryTarget | undefined): void {
  db.insert(discoveryProbes)
    .values({
      id: ulid(),
      companySlug: slug,
      platform,
      found: target !== undefined,
      target: target ?? null,
      probedAt: new Date().toISOString(),
    })
    .run();
}

export async function discoverTargets(
  db: Db,
  campaignsFilePath: string,
  options: DiscoverTargetsOptions = {},
): Promise<DiscoverySummary> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const allSlugs = new Set(
    db
      .selectDistinct({ companyName: offersTable.companyName })
      .from(offersTable)
      .all()
      .map((row) => companySlug(row.companyName)),
  );
  const alreadyProbed = new Set(
    db.selectDistinct({ companySlug: discoveryProbes.companySlug }).from(discoveryProbes).all().map((row) => row.companySlug),
  );
  const toProbe = Array.from(allSlugs)
    .filter((slug) => !alreadyProbed.has(slug))
    .slice(0, limit);

  const found: DiscoveredTarget[] = [];

  for (const slug of toProbe) {
    const digitalRecruiters = await probeDigitalRecruiters(slug, fetchImpl);
    recordProbe(db, slug, "digitalRecruiters", digitalRecruiters);
    if (digitalRecruiters) {
      found.push({ companySlug: slug, platform: "digitalRecruiters", target: digitalRecruiters });
      addTargetToCampaigns(campaignsFilePath, "digitalRecruiters", digitalRecruiters);
    }

    const smartrecruiters = await probeSmartRecruiters(slug, fetchImpl);
    recordProbe(db, slug, "smartrecruiters", smartrecruiters);
    if (smartrecruiters) {
      found.push({ companySlug: slug, platform: "smartrecruiters", target: smartrecruiters });
      addTargetToCampaigns(campaignsFilePath, "smartrecruiters", smartrecruiters);
    }

    const talentsoft = await probeTalentsoft(slug, fetchImpl);
    recordProbe(db, slug, "talentsoft", talentsoft);
    if (talentsoft) {
      found.push({ companySlug: slug, platform: "talentsoft", target: talentsoft });
      addTargetToCampaigns(campaignsFilePath, "talentsoft", talentsoft);
    }

    const workday = await probeWorkday(slug, fetchImpl);
    recordProbe(db, slug, "workday", workday);
    if (workday) {
      found.push({ companySlug: slug, platform: "workday", target: workday });
      addTargetToCampaigns(campaignsFilePath, "workday", workday);
    }
  }

  return { probed: toProbe.length, found };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/discovery/discover-targets.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/harvester/src/discovery/discover-targets.ts packages/harvester/src/discovery/discover-targets.test.ts
git commit -m "feat(harvester): orchestrateur de découverte de cibles (plafond, cache, écriture campaigns.yaml)"
```

---

## Task 10: Export depuis `packages/harvester`

**Files:**
- Modify: `packages/harvester/src/index.ts`

**Interfaces:**
- Produces: `discoverTargets`, `DiscoverySummary`, `DiscoveredTarget`, `DiscoverTargetsOptions` disponibles depuis `@job-harvester/harvester`.

- [ ] **Step 1: Ajouter l'export**

```ts
export * from "./discovery/discover-targets.js";
```

à ajouter à la fin de `packages/harvester/src/index.ts`.

- [ ] **Step 2: Vérifier la compilation**

Run: `pnpm --filter @job-harvester/harvester run typecheck`
Expected: PASS

- [ ] **Step 3: Suite complète harvester**

Run: `pnpm --filter @job-harvester/harvester exec vitest run`
Expected: PASS (tous les tests, y compris ceux des tasks 3-9)

- [ ] **Step 4: Commit**

```bash
git add packages/harvester/src/index.ts
git commit -m "feat(harvester): exporte discoverTargets depuis le package"
```

---

## Task 11: Branchement dans la route `POST /harvest/:campaignId/run`

**Files:**
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/routes/harvest.ts`
- Modify: `packages/api/src/app.test.ts`

**Interfaces:**
- Consumes: `discoverTargets` depuis `@job-harvester/harvester` (Task 9/10).
- Produces: `AppDeps` gagne deux champs optionnels : `campaignsFilePath?: string` et `discoveryFetchImpl?: typeof fetch`. La réponse de `POST /harvest/:campaignId/run` gagne un champ `discoveries: DiscoverySummary`. Quand `campaignsFilePath` est absent (comme dans tous les tests existants qui ne le fournissent pas), la découverte est sautée et `discoveries` vaut `{ probed: 0, found: [] }` — **zéro impact sur les tests existants**.

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/api/src/app.test.ts`, dans le describe `"POST /harvest/:campaignId/run"` :

```ts
  it("runs target discovery after a successful harvest when campaignsFilePath is provided, and reports it in the response", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-route-"));
    tmpDirs.push(dir);
    const campaignsFilePath = path.join(dir, "campaigns.yaml");
    writeFileSync(
      campaignsFilePath,
      `campaigns:
  - id: discovery-route-test
    romeCodes: [M1403]
    keywords: []
    locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }]
    contractTypes: [apprentissage]
`,
      "utf-8",
    );
    const connector = {
      id: "observing",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const discoveryFetchImpl = async () => new Response(JSON.stringify({ count: 1 }), { status: 200 });
    const app = createApp({ db, connectors: [connector], campaigns: [{ id: "discovery-route-test", romeCodes: ["M1403"], keywords: [], locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }], contractTypes: ["apprentissage"] }], env: {}, campaignsFilePath, discoveryFetchImpl });

    const res = await app.request("/harvest/discovery-route-test/run", { method: "POST" });
    const body = (await res.json()) as { discoveries: { probed: number; found: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.discoveries.probed).toBe(1);
    expect(body.discoveries.found.length).toBeGreaterThan(0);
  });

  it("omits real discovery work when campaignsFilePath is not provided (back-compat)", async () => {
    const db = createDb(tmpDbPath());
    const connector = {
      id: "observing-no-discovery",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing-no-discovery", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const campaign: CampaignConfig = {
      id: "no-discovery-test",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };
    const app = createApp({ db, connectors: [connector], campaigns: [campaign], env: {} });

    const res = await app.request("/harvest/no-discovery-test/run", { method: "POST" });
    const body = (await res.json()) as { discoveries: { probed: number; found: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.discoveries).toEqual({ probed: 0, found: [] });
  });
```

Modifier l'import Node existant en haut du fichier — remplacer :

```ts
import { mkdtempSync, rmSync } from "node:fs";
```

par :

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
```

(`path`, `tmpdir` et `CampaignConfig` sont déjà importés dans ce fichier.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/api exec vitest run app.test.ts -t "discovery"`
Expected: FAIL — `discoveries` absent de la réponse (`undefined`), et `AppDeps` n'accepte pas encore `campaignsFilePath`/`discoveryFetchImpl` (erreur de type ou propriété ignorée).

- [ ] **Step 3: Ajouter les champs à `AppDeps`**

Dans `packages/api/src/app.ts` :

```ts
export interface AppDeps {
  db: Db;
  connectors: Connector[];
  campaigns: CampaignConfig[];
  env: Record<string, string | undefined>;
  campaignsFilePath?: string;
  discoveryFetchImpl?: typeof fetch;
}
```

- [ ] **Step 4: Brancher `discoverTargets` dans la route**

Remplacer le contenu de `packages/api/src/routes/harvest.ts` par :

```ts
import type { Hono } from "hono";
import { z } from "zod";
import { ContractTypeSchema } from "@job-harvester/core";
import { LocationConfigSchema, discoverTargets, runCampaignAcrossConnectors, type HarvestOverrides } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

const HarvestOverridesBodySchema = z.object({
  keywords: z.array(z.string()).optional(),
  contractTypes: z.array(ContractTypeSchema).optional(),
  location: LocationConfigSchema.optional(),
});

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env, campaignsFilePath, discoveryFetchImpl }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    let overrides: HarvestOverrides = {};
    const rawBody = await c.req.text();
    if (rawBody.trim().length > 0) {
      const parsed = HarvestOverridesBodySchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
      overrides = parsed.data;
    }

    const summaries = await runCampaignAcrossConnectors(campaign, connectors, db, env, overrides);
    if (summaries.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 422);

    // Découverte de cibles : uniquement quand le chemin du fichier de campagnes est fourni
    // (jamais en test sans configuration explicite, jamais sur le cron — voir server.ts).
    const discoveries = campaignsFilePath
      ? await discoverTargets(db, campaignsFilePath, { fetchImpl: discoveryFetchImpl })
      : { probed: 0, found: [] };

    return c.json({ summaries, discoveries });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/api exec vitest run app.test.ts`
Expected: PASS (tous les tests, y compris les 2 nouveaux et tous les existants inchangés)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @job-harvester/api run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/app.ts packages/api/src/routes/harvest.ts packages/api/src/app.test.ts
git commit -m "feat(api): branche la découverte de cibles après une collecte manuelle"
```

---

## Task 12: Câblage `server.ts` (production)

**Files:**
- Modify: `packages/api/src/server.ts`

**Interfaces:**
- Consumes: `campaignsFilePath` déjà calculé (variable locale existante réutilisée, pas de nouveau calcul).

- [ ] **Step 1: Passer `campaignsFilePath` à `createApp`**

Dans `packages/api/src/server.ts`, la ligne :

```ts
const campaigns = loadCampaigns(path.resolve(repoRoot, process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml"));
```

devient (en gardant le chemin dans une variable) :

```ts
const campaignsFilePath = path.resolve(repoRoot, process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml");
const campaigns = loadCampaigns(campaignsFilePath);
```

Et la ligne :

```ts
const app = createApp({ db, connectors, campaigns, env: process.env });
```

devient :

```ts
const app = createApp({ db, connectors, campaigns, env: process.env, campaignsFilePath });
```

(`discoveryFetchImpl` reste `undefined` en production → `discoverTargets` utilise `fetch` global, comportement normal.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @job-harvester/api run typecheck`
Expected: PASS

- [ ] **Step 3: Vérification manuelle en conditions réelles**

Démarrer l'API (`pnpm dev:api`), lancer une collecte manuelle via `curl -X POST http://localhost:3000/harvest/<id>/run`, vérifier que la réponse contient un champ `discoveries`, et que `config/campaigns.yaml` a potentiellement de nouvelles entrées après le run (`git diff config/campaigns.yaml`). Le premier run sera plus long que d'habitude (jusqu'à 20 entreprises × jusqu'à 10 requêtes) — c'est attendu (voir Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/server.ts
git commit -m "feat(api): câble campaignsFilePath en production pour la découverte de cibles"
```

---

## Task 13: Réponse enrichie côté client web

**Files:**
- Modify: `packages/web/src/api/client.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DiscoveredTarget {
    companySlug: string;
    platform: string;
    target: string | { tenant: string; site: string; dc: string };
  }
  export interface HarvestRunResult {
    summaries: RunSummary[];
    discoveries: { probed: number; found: DiscoveredTarget[] };
  }
  export async function runHarvest(campaignId: string, filters?: HarvestFilters): Promise<HarvestRunResult>
  ```
  (signature change : `runHarvest` retournait `RunSummary[]`, retourne maintenant `HarvestRunResult`.)

- [ ] **Step 1: Modifier `runHarvest`**

Dans `packages/web/src/api/client.ts`, remplacer :

```ts
export async function runHarvest(campaignId: string, filters?: HarvestFilters): Promise<RunSummary[]> {
  const hasFilters = filters && (filters.keywords?.length || filters.contractTypes?.length || filters.location);
  const res = await fetch(`/harvest/${campaignId}/run`, {
    method: "POST",
    ...(hasFilters ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `POST /harvest/${campaignId}/run failed: HTTP ${res.status}`);
  return body.summaries;
}
```

par :

```ts
export interface DiscoveredTarget {
  companySlug: string;
  platform: string;
  target: string | { tenant: string; site: string; dc: string };
}

export interface HarvestRunResult {
  summaries: RunSummary[];
  discoveries: { probed: number; found: DiscoveredTarget[] };
}

export async function runHarvest(campaignId: string, filters?: HarvestFilters): Promise<HarvestRunResult> {
  const hasFilters = filters && (filters.keywords?.length || filters.contractTypes?.length || filters.location);
  const res = await fetch(`/harvest/${campaignId}/run`, {
    method: "POST",
    ...(hasFilters ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `POST /harvest/${campaignId}/run failed: HTTP ${res.status}`);
  // discoveries est optionnel côté réponse (routes/tests qui ne le fournissent pas encore) -
  // valeur neutre par défaut plutôt qu'un accès undefined côté composant.
  return { summaries: body.summaries, discoveries: body.discoveries ?? { probed: 0, found: [] } };
}
```

- [ ] **Step 2: Typecheck (attendu : erreur dans HarvestControl.tsx, corrigée à la Task 14)**

Run: `pnpm --filter @job-harvester/web run typecheck`
Expected: FAIL — `HarvestControl.tsx` traite encore `runHarvest` comme retournant `RunSummary[]` directement (utilisé dans `mutationFn`/`onSuccess`). C'est attendu à cette étape, corrigé Task 14.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/client.ts
git commit -m "feat(web): runHarvest retourne aussi les découvertes de cibles"
```

---

## Task 14: Affichage des découvertes dans `HarvestControl`

**Files:**
- Modify: `packages/web/src/components/HarvestControl.tsx`
- Modify: `packages/web/src/components/HarvestControl.test.tsx`

**Interfaces:**
- Consumes: `HarvestRunResult`, `DiscoveredTarget` depuis `../api/client.js` (Task 13).

- [ ] **Step 1: Write the failing test**

Ajouter dans `packages/web/src/components/HarvestControl.test.tsx` :

```ts
  it("displays discovered targets after a harvest run", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/campaigns")) {
        return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
      }
      if (url.includes("/harvest/")) {
        return new Response(
          JSON.stringify({
            summaries: [],
            discoveries: { probed: 3, found: [{ companySlug: "acme", platform: "digitalRecruiters", target: "joinus.acme.fr" }] },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.click(await screen.findByRole("button", { name: "Lancer la collecte" }));

    expect(await screen.findByText(/1 nouvelle cible découverte/)).toBeInTheDocument();
    expect(screen.getByText(/acme.*digitalRecruiters.*joinus\.acme\.fr/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/web exec vitest run src/components/HarvestControl.test.tsx -t "discovered targets"`
Expected: FAIL — le texte "nouvelle cible découverte" n'existe pas encore dans le composant.

- [ ] **Step 3: Mettre à jour le composant**

Dans `packages/web/src/components/HarvestControl.tsx` :

1. Changer l'import :

```ts
import { getCampaigns, runHarvest, type HarvestFilters, type HarvestRunResult, type RunSummary } from "../api/client.js";
```

2. Changer le type `LastResult` :

```ts
type LastResult = ({ campaignId: string } & HarvestRunResult) | { campaignId: string; error: string };
```

3. Dans `useMutation`, `onSuccess` :

```ts
    onSuccess: (result, { campaignId }) => {
      setLastResult({ campaignId, ...result });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
```

4. Après le bloc `{lastResult && "summaries" in lastResult && (...)}`, ajouter :

```tsx
      {lastResult && "discoveries" in lastResult && lastResult.discoveries.found.length > 0 && (
        <div className="text-xs text-[var(--color-text-muted)]">
          <p>{lastResult.discoveries.found.length} nouvelle{lastResult.discoveries.found.length > 1 ? "s" : ""} cible{lastResult.discoveries.found.length > 1 ? "s" : ""} découverte{lastResult.discoveries.found.length > 1 ? "s" : ""} (sur {lastResult.discoveries.probed} entreprise{lastResult.discoveries.probed > 1 ? "s" : ""} sondée{lastResult.discoveries.probed > 1 ? "s" : ""}) :</p>
          <ul>
            {lastResult.discoveries.found.map((d) => (
              <li key={`${d.companySlug}-${d.platform}`}>
                {d.companySlug} — {d.platform} — {typeof d.target === "string" ? d.target : `${d.target.tenant}.${d.target.dc}`}
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/web exec vitest run src/components/HarvestControl.test.tsx`
Expected: PASS (tous les tests du fichier, y compris ceux déjà existants — `RunSummary` reste importé et utilisé par le type `LastResult` via `HarvestRunResult`)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @job-harvester/web run typecheck`
Expected: PASS

- [ ] **Step 6: Suite complète web**

Run: `pnpm --filter @job-harvester/web exec vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/HarvestControl.tsx packages/web/src/components/HarvestControl.test.tsx
git commit -m "feat(web): affiche les cibles découvertes après une collecte"
```

---

## Task 15: Vérification finale de bout en bout

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Suite complète du monorepo**

Run: `pnpm -r run test`
Expected: PASS partout

- [ ] **Step 2: Typecheck complet**

Run: `pnpm -r run typecheck`
Expected: PASS partout

- [ ] **Step 3: Vérification en conditions réelles**

Redémarrer l'API (`pnpm dev:api`), ouvrir l'app web, cliquer "Lancer la collecte" sur une campagne, observer :
- le résumé de collecte habituel s'affiche toujours,
- un résumé de découvertes apparaît si au moins une entreprise a été confirmée sur une des 4 plateformes,
- `config/campaigns.yaml` contient bien les nouvelles cibles après le run (`git diff config/campaigns.yaml`),
- relancer la même collecte : le nombre d'entreprises sondées diminue (celles du run précédent ne sont plus resondées).

- [ ] **Step 4: Commit final si des ajustements ont eu lieu pendant la vérification**

```bash
git add -A
git commit -m "chore: ajustements post-vérification de la découverte de cibles"
```

(Uniquement si des changements ont réellement eu lieu — sinon, pas de commit vide.)
