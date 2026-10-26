import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Every constant `src/env.d.ts` declares is defined by `vite.config.ts`. A name renamed on one side only still compiles, and reads `undefined` in the built page: the web version then stops registering its service worker, with nothing to say so.
 */
describe("the build constants", () => {
  const read = (path: string) =>
    readFileSync(join(process.cwd(), path), "utf8");

  it("are all defined by the build", () => {
    const declared = [
      ...read("src/env.d.ts").matchAll(/readonly (VITE_\w+)/g),
    ].map((m) => m[1]);
    const config = read("vite.config.ts");
    expect(declared.length).toBeGreaterThan(0);
    expect(
      declared.filter((name) => !config.includes(`import.meta.env.${name}"`)),
    ).toEqual([]);
  });
});
