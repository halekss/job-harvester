import { describe, it, expect } from "vitest";
import { DomainRateLimiter } from "./domain-rate-limiter.js";

describe("DomainRateLimiter", () => {
  it("delays a second call to the same domain by at least minDelayMs", async () => {
    const limiter = new DomainRateLimiter(50);
    const start = Date.now();
    await limiter.wait("example.com");
    await limiter.wait("example.com");
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("does not delay calls to different domains", async () => {
    const limiter = new DomainRateLimiter(200);
    const start = Date.now();
    await limiter.wait("a.com");
    await limiter.wait("b.com");
    expect(Date.now() - start).toBeLessThan(100);
  });
});
