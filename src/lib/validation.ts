import { ValidationError } from "./errors.js";

/**
 * Lowercase, hyphen-separated slug: "quarterly-reports-2026".
 * No leading/trailing hyphens, no consecutive hyphens, no uppercase.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} must not be empty`);
  }
  return trimmed;
}

export function assertValidSlug(slug: string): string {
  const trimmed = slug.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("slug must not be empty");
  }
  if (!SLUG_PATTERN.test(trimmed)) {
    throw new ValidationError(
      `slug "${trimmed}" is malformed — use lowercase letters, numbers, and single hyphens only (e.g. "quarterly-reports-2026")`,
    );
  }
  return trimmed;
}

const MAX_TAKE = 100;
const DEFAULT_TAKE = 20;

/**
 * Clamps and validates the `take` argument for cursor pagination.
 * Throws on values that are clearly wrong (<= 0) instead of silently
 * coercing them, since a caller passing take: 0 or a negative number is
 * almost certainly a bug on their side worth surfacing.
 */
export function resolveTake(take: number | null | undefined): number {
  if (take === null || take === undefined) {
    return DEFAULT_TAKE;
  }
  if (!Number.isInteger(take) || take <= 0) {
    throw new ValidationError("take must be a positive integer");
  }
  return Math.min(take, MAX_TAKE);
}
