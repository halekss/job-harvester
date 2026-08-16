import { describe, it, expect } from "vitest";
import { normalizeWorkdayOffer } from "./normalize.js";

const rawOfferPayload = {
  target: { tenant: "valeo", site: "valeo_jobs", dc: "wd3" },
  externalPath: "/job/Lille/Alternant-Data-Analyst_REQ2026000111",
  jobPostingInfo: {
    title: "Alternant Data Analyst",
    jobDescription: "<p>Rejoignez notre équipe <strong>data</strong>.</p>",
    location: "Lille",
    jobReqId: "REQ2026000111",
    externalUrl: "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111",
  },
};

describe("normalizeWorkdayOffer", () => {
  it("maps fields, strips HTML from the description, and uses the externalUrl as applyUrl", () => {
    const offer = normalizeWorkdayOffer({ source: "workday", payload: rawOfferPayload });

    expect(offer.source).toBe("workday");
    expect(offer.sourceOfferId).toBe("REQ2026000111");
    expect(offer.title).toBe("Alternant Data Analyst");
    expect(offer.descriptionText).toBe("Rejoignez notre équipe data .");
    expect(offer.applyUrl).toBe("https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111");
    expect(offer.location.city).toBe("Lille");
    expect(offer.company.normalizedName).toBe("valeo");
    expect(offer.romeCodes).toEqual([]);
    expect(offer.originSource).toBeUndefined();
  });

  it("infers contractType apprentissage from the title/description text", () => {
    const offer = normalizeWorkdayOffer({
      source: "workday",
      payload: { ...rawOfferPayload, jobPostingInfo: { ...rawOfferPayload.jobPostingInfo, title: "Contrat d'apprentissage - Data Analyst" } },
    });
    expect(offer.contractType).toBe("apprentissage");
  });

  it("constructs applyUrl from target+externalPath when externalUrl is absent", () => {
    const { externalUrl: _drop, ...jobPostingInfoWithoutExternalUrl } = rawOfferPayload.jobPostingInfo;
    const offer = normalizeWorkdayOffer({
      source: "workday",
      payload: { ...rawOfferPayload, jobPostingInfo: jobPostingInfoWithoutExternalUrl },
    });
    expect(offer.applyUrl).toBe("https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeWorkdayOffer({ source: "workday", payload: { nope: true } })).toThrow();
  });
});
