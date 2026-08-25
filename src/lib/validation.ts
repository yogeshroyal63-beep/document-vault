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

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

/**
 * Validates and normalizes a tags array. Rejects empty/whitespace-only
 * tags and tags over MAX_TAG_LENGTH (both almost certainly bugs on the
 * caller's side, same reasoning as resolveTake below), caps the array at
 * MAX_TAGS, trims each tag, and de-duplicates — "finance" and "finance "
 * or a repeated tag shouldn't create two distinct tags.
 */
export function assertValidTags(tags: string[] | null | undefined): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }
  if (tags.length > MAX_TAGS) {
    throw new ValidationError(`a document may have at most ${MAX_TAGS} tags`);
  }

  const normalized = tags.map((tag) => tag.trim());
  const empty = normalized.find((tag) => tag.length === 0);
  if (empty !== undefined) {
    throw new ValidationError("tags must not be empty or whitespace-only");
  }
  const tooLong = normalized.find((tag) => tag.length > MAX_TAG_LENGTH);
  if (tooLong !== undefined) {
    throw new ValidationError(`tags must be at most ${MAX_TAG_LENGTH} characters ("${tooLong}" is longer)`);
  }

  return [...new Set(normalized)];
}

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