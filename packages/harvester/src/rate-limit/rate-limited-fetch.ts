const DEFAULT_BUCKET_CAPACITY = 3;
const DEFAULT_REFILL_PER_SECOND = 1;
const DEFAULT_RETRY_DELAYS_MS: [number, number] = [500, 1000];
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefillAt = now;
  }

  async take(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000;
      await sleep(waitMs);
      this.refill();
    }
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

function extractHostname(input: string | URL | Request): string {
  if (typeof input === "string") return new URL(input).hostname;
  if (input instanceof URL) return input.hostname;
  return new URL(input.url).hostname;
}

export interface RateLimitedFetchOptions {
  bucketCapacity?: number;
  refillPerSecond?: number;
  retryDelaysMs?: [number, number];
}

export function createRateLimitedFetch(baseFetch: typeof fetch, options: RateLimitedFetchOptions = {}): typeof fetch {
  const bucketCapacity: number = options.bucketCapacity ?? DEFAULT_BUCKET_CAPACITY;
  const refillPerSecond: number = options.refillPerSecond ?? DEFAULT_REFILL_PER_SECOND;
  const retryDelaysMs: [number, number] = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const buckets = new Map<string, TokenBucket>();

  return async function rateLimitedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const hostname = extractHostname(input);
    let bucket = buckets.get(hostname);
    if (!bucket) {
      bucket = new TokenBucket(bucketCapacity, refillPerSecond);
      buckets.set(hostname, bucket);
    }

    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await bucket.take();
      response = await baseFetch(input, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt < MAX_ATTEMPTS) {
        const delayIndex = Math.min(attempt - 1, retryDelaysMs.length - 1);
        await sleep(Math.random() * retryDelaysMs[delayIndex]!);
      }
    }
    return response as Response;
  };
}
