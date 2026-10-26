import { describe, expect, it } from "vitest";
import { InjectionToken, inject, provide, resetInjection } from "./injection";

class Counter {
  value = 0;
}

class Consumer {
  readonly counter = inject(Counter);
}

describe("injection", () => {
  it("returns a single instance per service", () => {
    expect(inject(Consumer).counter).toBe(inject(Counter));
  });

  it("returns the provided fake in place of the service", () => {
    const fake = { value: 42 };
    provide(Counter, fake);
    expect(inject(Consumer).counter.value).toBe(42);
  });

  it("starts again from an empty container after reset", () => {
    const first = inject(Counter);
    resetInjection();
    expect(inject(Counter)).not.toBe(first);
  });

  it("uses a token's factory, and refuses a token without a value", () => {
    expect(inject(new InjectionToken("avec", { factory: () => 3 }))).toBe(3);
    const without = new InjectionToken<number>("sans");
    expect(() => inject(without)).toThrow(/sans/);
    expect(inject(without, { optional: true })).toBeNull();
  });

  it("reports a circular dependency rather than overflowing the stack", () => {
    class A {
      readonly b: unknown = inject(B);
    }
    class B {
      readonly a = inject(A);
    }
    expect(() => inject(A)).toThrow(/circulaire/);
  });
});
