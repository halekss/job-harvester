import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "./canonicalize.js";

describe("canonicalizeUrl", () => {
  it("collapses the two sample duplicate URLs for offer 6a5a004c8bfdaae34d6a2ea4 to the same canonical string", () => {
    const urlA =
      "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/6a5a004c8bfdaae34d6a2ea4?utm_source=la_bonne_alternance";
    const urlB =
      "https://LaBonneAlternance.apprentissage.beta.gouv.fr/emploi/6a5a004c8bfdaae34d6a2ea4/?utm_source=bonnealternance&utm_medium=metamoteurs-free&from=%2Fbeta%2Frecherche%3Fq%3Ddata%26lieu_label%3DLille";
    expect(canonicalizeUrl(urlA)).toBe(canonicalizeUrl(urlB));
  });

  it("removes utm_*, from, source, ref, gh_src, sid and sorts remaining params", () => {
    const url = "https://Example.com/jobs/42/?b=2&utm_campaign=x&a=1&source=agg&ref=xyz&gh_src=1&sid=1";
    expect(canonicalizeUrl(url)).toBe("https://example.com/jobs/42?a=1&b=2");
  });

  it("strips a trailing slash but keeps a bare root path", () => {
    expect(canonicalizeUrl("https://example.com/jobs/1/")).toBe("https://example.com/jobs/1");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });
});
