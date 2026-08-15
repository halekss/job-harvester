import { describe, it, expect } from "vitest";
import { trigramSimilarity } from "./similarity.js";

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("acme", "acme")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(trigramSimilarity("acme", "zzzzzzzz")).toBe(0);
  });

  it("returns a high score for near-identical strings", () => {
    expect(trigramSimilarity("data analyst", "data analyste")).toBeGreaterThan(0.7);
  });
});
