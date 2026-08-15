export class DomainRateLimiter {
  private readonly lastRequestAtByDomain = new Map<string, number>();

  constructor(private readonly minDelayMs: number = 1000) {}

  async wait(domain: string): Promise<void> {
    const last = this.lastRequestAtByDomain.get(domain);
    const now = Date.now();
    if (last !== undefined) {
      const elapsed = now - last;
      if (elapsed < this.minDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minDelayMs - elapsed));
      }
    }
    this.lastRequestAtByDomain.set(domain, Date.now());
  }
}
