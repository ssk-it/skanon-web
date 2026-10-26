import { describe, expect, it } from "vitest";
import { trimTrailing } from "./text";

describe("trimTrailing", () => {
  it("removes every trailing occurrence of the character", () => {
    expect(trimTrailing("https://exemple.test///", "/")).toBe(
      "https://exemple.test",
    );
  });

  it("leaves the occurrences that are not at the end", () => {
    expect(trimTrailing("a\n\nb\n", "\n")).toBe("a\n\nb");
  });

  it("empties a text made only of the character", () => {
    expect(trimTrailing("===", "=")).toBe("");
  });

  // `/\/+$/` retries from each slash of a run that is not at the end: a
  // million of them would take minutes, past the test's timeout.
  it("stays linear on a long run that is not at the end", () => {
    const text = `${"/".repeat(1_000_000)}x`;
    expect(trimTrailing(text, "/")).toBe(text);
  });
});
