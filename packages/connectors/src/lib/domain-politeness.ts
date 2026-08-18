const DEFAULT_MIN_DELAY_MS = 1000;

// JOB-7 : `DomainRateLimiter` (packages/harvester/src/rate-limit/domain-rate-limiter.ts) no
// longer exists in @job-harvester/harvester — it was replaced by the per-hostname token bucket
// in createRateLimitedFetch (JOB-5/JOB-12), which already wraps ctx.fetchImpl for every request.
// That wrapper is not exported from the package's public API, so this connector-local class
// keeps the original name/shape for a connector (sitemap-crawler) that walks many URLs on the
// same domain and wants an explicit minimum spacing between them, independent of fetchImpl.
export class DomainRateLimiter {
  private readonly lastCallAt = new Map<string, number>();

  constructor(private readonly minDelayMs: number = DEFAULT_MIN_DELAY_MS) {}

  async wait(key: string): Promise<void> {
    const now = Date.now();
    const last = this.lastCallAt.get(key);
    if (last !== undefined) {
      const elapsed = now - last;
      if (elapsed < this.minDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minDelayMs - elapsed));
      }
    }
    this.lastCallAt.set(key, Date.now());
  }
}

const sharedLimiter = new DomainRateLimiter();

export async function waitForDomain(url: string): Promise<void> {
  await sharedLimiter.wait(new URL(url).hostname);
}
