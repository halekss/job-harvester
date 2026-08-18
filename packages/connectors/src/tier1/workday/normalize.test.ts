import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { normalizeWorkdayOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/workday");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

const target = { tenant: "valeo", site: "valeo_jobs", dc: "wd3" };
const externalPath = "/job/Lille/Alternant-Data-Analyst_REQ2026000111";

function loadRawOfferPayload(): { target: typeof target; externalPath: string; jobPostingInfo: unknown } {
  const detail = loadFixture("job-detail.json") as { jobPostingInfo: unknown };
  return { target, externalPath, jobPostingInfo: detail.jobPostingInfo };
}

describe("normalizeWorkdayOffer", () => {
  it("maps fields, strips HTML from the description, and uses the externalUrl as applyUrl", () => {
    const offer = normalizeWorkdayOffer({ source: "workday", payload: loadRawOfferPayload() });

    expect(offer.source).toBe("workday");
    expect(offer.sourceOfferId).toBe("REQ2026000111");
    expect(offer.title).toBe("Alternant Data Analyst");
    expect(offer.descriptionText).toBe("Rejoignez notre équipe data pour une alternance de 12 mois. Analyse de données");
    expect(offer.applyUrl).toBe("https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111");
    expect(offer.location.city).toBe("Lille");
    expect(offer.company.normalizedName).toBe("valeo");
    expect(offer.romeCodes).toEqual([]);
    expect(offer.originSource).toBeUndefined();
    // JOB-33 : inferContractTypeFromText reconnaît désormais "alternant"/"alternance" comme
    // mappant à apprentissage par défaut (le titre/la description contiennent "Alternant"/"alternance").
    expect(offer.contractType).toBe("apprentissage");
  });

  it("infers contractType apprentissage from the title/description text", () => {
    const raw = loadRawOfferPayload();
    const offer = normalizeWorkdayOffer({
      source: "workday",
      payload: { ...raw, jobPostingInfo: { ...(raw.jobPostingInfo as Record<string, unknown>), title: "Contrat d'apprentissage - Data Analyst" } },
    });
    expect(offer.contractType).toBe("apprentissage");
  });

  it("constructs applyUrl from target+externalPath when externalUrl is absent", () => {
    const raw = loadRawOfferPayload();
    const { externalUrl: _drop, ...jobPostingInfoWithoutExternalUrl } = raw.jobPostingInfo as Record<string, unknown>;
    const offer = normalizeWorkdayOffer({
      source: "workday",
      payload: { ...raw, jobPostingInfo: jobPostingInfoWithoutExternalUrl },
    });
    expect(offer.applyUrl).toBe("https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeWorkdayOffer({ source: "workday", payload: { nope: true } })).toThrow();
  });

  it("derives a deterministic id from source and sourceOfferId (stable across DB reconstruction)", () => {
    const offer1 = normalizeWorkdayOffer({ source: "workday", payload: loadRawOfferPayload() });
    const offer2 = normalizeWorkdayOffer({ source: "workday", payload: loadRawOfferPayload() });

    expect(offer1.id).toBe(offer2.id);
    expect(offer1.id).toBe(exactDedupKeyFromSource("workday", "REQ2026000111"));
  });
});
