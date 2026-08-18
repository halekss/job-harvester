import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimitedFetch } from "./rate-limited-fetch.js";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRateLimitedFetch", () => {
  it("throttles a second call to the same domain but not a call to a different domain", async () => {
    const baseFetch = vi.fn(async () => jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 1,
      refillPerSecond: 5, // 1 token every 200ms
    });

    const start = Date.now();
    await rateLimitedFetch("https://a.example.com/jobs");
    await rateLimitedFetch("https://a.example.com/jobs"); // must wait ~200ms (bucket empty)
    const afterSameDomain = Date.now() - start;

    await rateLimitedFetch("https://b.example.com/jobs"); // fresh bucket, must not wait
    const afterDifferentDomain = Date.now() - start;

    expect(afterSameDomain).toBeGreaterThanOrEqual(180);
    expect(afterDifferentDomain - afterSameDomain).toBeLessThan(100);
  });

  it("retries on a 429 and returns the eventual success", async () => {
    const baseFetch = vi.fn().mockResolvedValueOnce(jsonResponse(429)).mockResolvedValueOnce(jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [10, 20],
    });

    const response = await rateLimitedFetch("https://example.com/jobs");

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts and returns the last failing response", async () => {
    const baseFetch = vi.fn(async () => jsonResponse(503));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [5, 5],
    });

    const response = await rateLimitedFetch("https://example.com/jobs");

    expect(response.status).toBe(503);
    expect(baseFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a plain 200 (no wasted attempts)", async () => {
    const baseFetch = vi.fn(async () => jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [5, 5],
    });

    await rateLimitedFetch("https://example.com/jobs");

    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("applies increasing backoff delays between retries (full jitter at its maximum)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // full jitter always picks the max of the range
    const baseFetch = vi.fn().mockResolvedValueOnce(jsonResponse(500)).mockResolvedValueOnce(jsonResponse(500)).mockResolvedValueOnce(jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [30, 60],
    });

    const start = Date.now();
    const response = await rateLimitedFetch("https://example.com/jobs");
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(85); // ~30ms + ~60ms, minus small scheduling slack
  });
});
