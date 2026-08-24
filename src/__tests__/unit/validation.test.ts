import { describe, expect, test } from "bun:test";
import { assertNonEmpty, assertValidSlug, resolveTake } from "../../lib/validation.js";
import { ValidationError } from "../../lib/errors.js";

describe("assertNonEmpty", () => {
  test("returns the trimmed value when non-empty", () => {
    expect(assertNonEmpty("  hello  ", "title")).toBe("hello");
  });

  test("throws ValidationError on empty string", () => {
    expect(() => assertNonEmpty("", "title")).toThrow(ValidationError);
  });

  test("throws ValidationError on whitespace-only string", () => {
    expect(() => assertNonEmpty("   ", "content")).toThrow(ValidationError);
  });

  test("error message names the field", () => {
    expect(() => assertNonEmpty("", "title")).toThrow(/title/);
  });
});

describe("assertValidSlug", () => {
  test("accepts a well-formed slug", () => {
    expect(assertValidSlug("quarterly-reports-2026")).toBe("quarterly-reports-2026");
  });

  test("accepts a single-word slug", () => {
    expect(assertValidSlug("invoices")).toBe("invoices");
  });

  test("rejects empty string", () => {
    expect(() => assertValidSlug("")).toThrow(ValidationError);
  });

  test("rejects uppercase letters", () => {
    expect(() => assertValidSlug("Quarterly-Reports")).toThrow(ValidationError);
  });

  test("rejects spaces", () => {
    expect(() => assertValidSlug("quarterly reports")).toThrow(ValidationError);
  });

  test("rejects leading hyphen", () => {
    expect(() => assertValidSlug("-quarterly")).toThrow(ValidationError);
  });

  test("rejects trailing hyphen", () => {
    expect(() => assertValidSlug("quarterly-")).toThrow(ValidationError);
  });

  test("rejects consecutive hyphens", () => {
    expect(() => assertValidSlug("quarterly--reports")).toThrow(ValidationError);
  });

  test("rejects underscores", () => {
    expect(() => assertValidSlug("quarterly_reports")).toThrow(ValidationError);
  });
});

describe("resolveTake", () => {
  test("defaults to 20 when not provided", () => {
    expect(resolveTake(undefined)).toBe(20);
    expect(resolveTake(null)).toBe(20);
  });

  test("returns the given value when within bounds", () => {
    expect(resolveTake(5)).toBe(5);
  });

  test("clamps to the maximum of 100", () => {
    expect(resolveTake(500)).toBe(100);
  });

  test("throws on zero", () => {
    expect(() => resolveTake(0)).toThrow(ValidationError);
  });

  test("throws on negative numbers", () => {
    expect(() => resolveTake(-5)).toThrow(ValidationError);
  });

  test("throws on non-integer values", () => {
    expect(() => resolveTake(1.5)).toThrow(ValidationError);
  });
});
