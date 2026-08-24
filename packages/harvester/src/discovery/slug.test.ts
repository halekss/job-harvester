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
