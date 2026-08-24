import { describe, it, expect, vi } from "vitest";
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
