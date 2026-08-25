import { describe, it, expect, vi } from "vitest";
import type { NormalizedOffer } from "@job-harvester/core";
import {
  offerMatchesQuery,
  departmentFromLabel,
  acceptableLocationsFromLocations,
  haversineDistanceKm,
  type QueryFilter,
  type AcceptableLocation,
} from "./query-filter.js";

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

// Lille (centre de gravité utilisé dans la plupart des scénarios ci-dessous).
const LILLE: AcceptableLocation = { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 };
const AMIENS: AcceptableLocation = { label: "Amiens 80000", lat: 49.903041, lng: 2.292605, radiusKm: 30 };
// Lens (Pas-de-Calais, dept 62) : à ~27 km de Lille, donc dans le rayon de 30 km ci-dessus mais
// dans un département voisin — sert à vérifier que le rayon prime sur l'égalité de département.
const LENS_LAT = 50.4331;
const LENS_LNG = 2.8319;
// Marseille : loin de toutes les localisations ci-dessus, ni dans un rayon ni dans un département accepté.
const MARSEILLE_LAT = 43.2965;
const MARSEILLE_LNG = 5.3698;

const permissiveFilter: QueryFilter = { contractTypes: [], keywords: [], acceptableLocations: [] };

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

describe("haversineDistanceKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceKm(50.63, 3.05, 50.63, 3.05)).toBe(0);
  });

  it("returns a plausible distance for two known French cities (Lille -> Paris, ~220km great-circle)", () => {
    const distance = haversineDistanceKm(50.630951, 3.045391, 48.8566, 2.3522);
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(240);
  });
});

describe("acceptableLocationsFromLocations", () => {
  it("carries lat/lng/radiusKm through unchanged, one entry per input location", () => {
    expect(
      acceptableLocationsFromLocations([
        { label: "Lille 59000", lat: 50.63, lng: 3.05, radiusKm: 30 },
        { label: "Amiens 80000", lat: 49.9, lng: 2.29, radiusKm: 30 },
      ]),
    ).toEqual([
      { label: "Lille 59000", lat: 50.63, lng: 3.05, radiusKm: 30 },
      { label: "Amiens 80000", lat: 49.9, lng: 2.29, radiusKm: 30 },
    ]);
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
  it("applies no location constraint when acceptableLocations is empty", () => {
    const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [] };
    expect(offerMatchesQuery(makeOffer({ location: { label: "Marseille 13000", city: "Marseille", department: "13" } }), filter)).toBe(
      true,
    );
  });

  describe("niveau 1 — rayon géographique (offre avec coordonnées, JOB-75)", () => {
    it("accepts an offer within radius of an acceptable location", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      expect(
        offerMatchesQuery(
          makeOffer({ location: { label: "Lille", city: "Lille", lat: 50.63, lng: 3.05 } }),
          filter,
        ),
      ).toBe(true);
    });

    it("accepts an offer within radius even when its department differs from the location's (I-2 regression guard)", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      expect(
        offerMatchesQuery(
          makeOffer({ location: { label: "Lens", city: "Lens", department: "62", lat: LENS_LAT, lng: LENS_LNG } }),
          filter,
        ),
      ).toBe(true);
    });

    it("rejects an offer with coordinates outside every acceptable radius, even if department matched textually", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      expect(
        offerMatchesQuery(
          makeOffer({ location: { label: "Marseille", city: "Marseille", lat: MARSEILLE_LAT, lng: MARSEILLE_LNG } }),
          filter,
        ),
      ).toBe(false);
    });
  });

  describe("niveau 2 — égalité de département (offre sans coordonnées, avec département résolu)", () => {
    it("accepts an offer whose department is in the acceptable set", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE, AMIENS] };
      expect(offerMatchesQuery(makeOffer({ location: { label: "Paris 75000", city: "Paris", department: "75" } }), filter)).toBe(
        false,
      );
      expect(offerMatchesQuery(makeOffer({ location: { label: "Amiens 80000", city: "Amiens", department: "80" } }), filter)).toBe(
        true,
      );
    });

    it("rejects an offer whose department is outside the acceptable set", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      expect(offerMatchesQuery(makeOffer({ location: { label: "Marseille 13000", city: "Marseille", department: "13" } }), filter)).toBe(
        false,
      );
    });
  });

  describe("niveau 3 — nom de ville normalisé (offre sans coordonnées ni département, cas Workday)", () => {
    it("accepts a bare city name matching an acceptable location's label", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      expect(offerMatchesQuery(makeOffer({ source: "workday", location: { label: "Lille", city: "Lille" } }), filter)).toBe(true);
    });

    it("is case- and accent-insensitive", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [AMIENS] };
      expect(offerMatchesQuery(makeOffer({ source: "workday", location: { label: "AMIENS", city: "AMIENS" } }), filter)).toBe(true);
    });

    it("rejects a city name that matches no acceptable location", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      expect(offerMatchesQuery(makeOffer({ source: "workday", location: { label: "Marseille", city: "Marseille" } }), filter)).toBe(
        false,
      );
    });
  });

  describe("niveau 4 — fail-closed (aucune information de localisation exploitable)", () => {
    it("rejects an offer with no coordinates, no department, and an unrecognized city name", () => {
      const filter: QueryFilter = { ...permissiveFilter, acceptableLocations: [LILLE] };
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(offerMatchesQuery(makeOffer({ source: "some-source", location: { label: "", city: "" } }), filter)).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("some-source"));
      warnSpy.mockRestore();
    });
  });
});

describe("offerMatchesQuery — combined", () => {
  it("rejects on the first failing criterion even when others would pass", () => {
    const filter: QueryFilter = { contractTypes: ["stage"], keywords: ["data"], acceptableLocations: [LILLE] };
    expect(
      offerMatchesQuery(
        makeOffer({ contractType: "apprentissage", title: "Data Analyst", location: { label: "Lille 59000", city: "Lille", department: "59" } }),
        filter,
      ),
    ).toBe(false);
  });

  it("accepts an offer passing all three criteria", () => {
    const filter: QueryFilter = { contractTypes: ["apprentissage"], keywords: ["data"], acceptableLocations: [LILLE] };
    expect(
      offerMatchesQuery(
        makeOffer({ contractType: "apprentissage", title: "Data Analyst", location: { label: "Lille 59000", city: "Lille", department: "59" } }),
        filter,
      ),
    ).toBe(true);
  });
});
