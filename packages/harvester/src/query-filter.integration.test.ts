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
          // Entreprise distincte de "data-ok" : même ville/titre, sinon isFuzzyDuplicate
          // (packages/core/src/dedup/merge.ts) fusionnerait les deux offres en une seule ligne
          // et masquerait une régression du filtre contractType (storedIds resterait correct
          // même si le check contractType était cassé).
          return makeOffer(payload.id, payload.url, {
            contractType: "autre",
            company: { name: "Gamma Corp", normalizedName: "gamma corp" },
          });
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
          // Entreprise distincte de "data-ok" pour la même raison que cdi-wrong-contract
          // ci-dessus : éviter qu'isFuzzyDuplicate masque une régression du fail-closed.
          return makeOffer(payload.id, payload.url, {
            location: { label: "Lille", city: "Lille" },
            company: { name: "Delta Corp", normalizedName: "delta corp" },
          });
        }
        // Entreprise distincte de "data-ok" (tier0Like) : même ville, même titre/mots-clés —
        // sans ça, isFuzzyDuplicate (packages/core/src/dedup/merge.ts) fusionne les deux offres
        // en une seule ligne (même ville + trigram similarity company/title >= 0.6), ce qui
        // ferait échouer l'assertion sur storedIds pour une raison sans rapport avec le filtre
        // testé ici.
        return makeOffer(payload.id, payload.url, { company: { name: "Beta Corp", normalizedName: "beta corp" } });
      },
      async healthCheck() {
        return { connectorId: "tier1-fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    const summaries = await runCampaignAcrossConnectors(dataCampaign, [tier0Like, tier1Like], db, {});

    const stored = db.select().from(offersTable).all();
    const storedIds = stored.map((row) => row.sourceOfferId).sort();

    expect(storedIds).toEqual(["data-ok", "lille-ok"]);

    // Preuve que chaque rejet a bien eu lieu (et pas juste que storedIds "tombe juste") :
    // devweb-offtopic (mots-clés), marseille-offtopic (département), cdi-wrong-contract
    // (type de contrat), no-department (fail-closed) doivent chacun être rejetés. Sans cette
    // assertion, storedIds seul ne détecterait pas une régression sur cdi-wrong-contract ou
    // no-department : leurs offres partagent ville/titre avec data-ok et seraient simplement
    // fusionnées par isFuzzyDuplicate si le filtre correspondant cessait de les rejeter.
    const totalRejected = summaries.reduce((sum, summary) => sum + summary.rejectedCount, 0);
    expect(totalRejected).toBe(4);
  });
});
