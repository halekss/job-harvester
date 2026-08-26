import { describe, expect, it } from "vitest";
import type { OfferSummary } from "../api/client.js";
import { PIPELINE_LANES, groupByStatus } from "./pipeline.js";

function makeOffer(id: string, status: string): OfferSummary {
  return {
    id,
    title: `Offre ${id}`,
    company: { name: "Acme" },
    location: { city: "Lille" },
    source: "labonnealternance",
    contractType: "apprentissage",
    canonicalUrl: `https://example.com/${id}`,
    nextFollowUpAt: null,
    activeEvents: {},
    status,
  };
}

describe("PIPELINE_LANES", () => {
  it("has 6 lanes in the existing product order", () => {
    expect(PIPELINE_LANES.map((lane) => lane.type)).toEqual([
      "applied",
      "spontaneous",
      "followup",
      "interview",
      "rejected",
      "no_reply",
    ]);
  });
});

describe("groupByStatus", () => {
  it("puts offers with status 'new' in the quai and nowhere else", () => {
    const offers = [makeOffer("a", "new")];
    const { quai, lanes } = groupByStatus(offers);
    expect(quai.map((o) => o.id)).toEqual(["a"]);
    expect(Object.values(lanes).flat()).toHaveLength(0);
  });

  it("buckets each offer into the lane matching its status", () => {
    const offers = [makeOffer("a", "applied"), makeOffer("b", "interview"), makeOffer("c", "applied")];
    const { lanes } = groupByStatus(offers);
    expect(lanes.applied.map((o) => o.id)).toEqual(["a", "c"]);
    expect(lanes.interview.map((o) => o.id)).toEqual(["b"]);
    expect(lanes.rejected).toEqual([]);
  });

  it("returns empty buckets for an empty input", () => {
    const { quai, lanes } = groupByStatus([]);
    expect(quai).toEqual([]);
    for (const lane of PIPELINE_LANES) {
      expect(lanes[lane.type]).toEqual([]);
    }
  });
});
