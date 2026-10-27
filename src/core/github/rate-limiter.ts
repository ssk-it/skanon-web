/**
 * Queue with bounded concurrency.
 *
 * The GitHub API's secondary limits — 100 concurrent requests, 900
 * points per minute — apply to the token: regulation therefore lives here,
 * on the side of whoever presents it. See RG-regulation-appels.
 *
 * The default value is deliberately cautious: exceeding the secondary
 * limits costs a 403 with `Retry-After`, well before the hourly quota
 * runs out.
 */
export class RateLimiter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maxConcurrent = 6) {}

  /** Runs `task` as soon as a slot frees up. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
