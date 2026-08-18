import { describe, it, expect } from "vitest";
import { exactDedupKeyFromSource, exactDedupKeyFromUrl } from "./dedup-key.js";

describe("exactDedupKeyFromUrl", () => {
  it("produces the same key for the same canonical URL", () => {
    const key1 = exactDedupKeyFromUrl("https://example.com/jobs/1");
    const key2 = exactDedupKeyFromUrl("https://example.com/jobs/1");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different URLs", () => {
    expect(exactDedupKeyFromUrl("https://example.com/jobs/1")).not.toBe(
      exactDedupKeyFromUrl("https://example.com/jobs/2"),
    );
  });
});

describe("exactDedupKeyFromSource", () => {
  it("produces the same key for the same (source, sourceOfferId) pair", () => {
    const key1 = exactDedupKeyFromSource("labonnealternance", "abc123");
    const key2 = exactDedupKeyFromSource("labonnealternance", "abc123");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different sourceOfferId within the same source", () => {
    expect(exactDedupKeyFromSource("labonnealternance", "abc123")).not.toBe(
      exactDedupKeyFromSource("labonnealternance", "xyz789"),
    );
  });

  it("produces different keys for the same sourceOfferId across different sources", () => {
    expect(exactDedupKeyFromSource("labonnealternance", "abc123")).not.toBe(
      exactDedupKeyFromSource("francetravail", "abc123"),
    );
  });
});
