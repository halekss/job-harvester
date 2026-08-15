import { describe, it, expect } from "vitest";
import { exactDedupKeyFromUrl } from "./dedup-key.js";

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
