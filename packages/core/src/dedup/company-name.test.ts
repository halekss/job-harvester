import { describe, it, expect } from "vitest";
import { normalizeCompanyName } from "./company-name.js";

describe("normalizeCompanyName", () => {
  it("strips common legal suffixes", () => {
    expect(normalizeCompanyName("Groupe ACME SAS")).toBe("acme");
    expect(normalizeCompanyName("Société Générale SA")).toBe("societe generale");
  });

  it("lowercases and strips accents and punctuation", () => {
    expect(normalizeCompanyName("Électricité de France")).toBe("electricite de france");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeCompanyName("Acme   Corp")).toBe("acme corp");
  });
});
