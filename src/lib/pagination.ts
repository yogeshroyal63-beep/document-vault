import { ValidationError } from "./errors.js";

/**
 * Cursor pagination strategy: order rows by (createdAt desc, id desc) for a
 * stable total order (createdAt alone can collide), fetch `take + 1` rows,
 * and use the extra row only to decide `hasMore` — it is never returned to
 * the caller. `nextCursor` is the id of the last *returned* row; Prisma's
 * `cursor: { id }` + `skip: 1` combo then resumes exactly after that row.
 *
 * Known limitation (Prisma's cursor design, not specific to this code):
 * Prisma resolves `cursor: { id }` by first looking the row up by that id,
 * then paginating from its position. If that row was deleted between page
 * 1 and the page-2 request, the lookup returns nothing and Prisma throws
 * — see resolveCursorError below, which turns that into a clean,
 * actionable GraphQL error instead of a 500.
 */
export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function paginate<T extends { id: string }>(
  rows: T[],
  take: number,
): PageResult<T> {
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? last.id : null,
  };
}

/**
 * Prisma throws a generic P2025-style "record not found" when a cursor id
 * no longer exists (see the class comment above). Call this from the
 * documents resolver's catch block to turn that into a message that tells
 * the caller what actually happened and what to do about it, rather than
 * a bare "record not found" that looks like a server bug.
 */
export function resolveCursorError(err: unknown, cursor: string): never {
  const isCursorLookupFailure =
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2025";

  if (isCursorLookupFailure) {
    throw new ValidationError(
      `cursor "${cursor}" no longer refers to an existing document (it may have been deleted) — restart pagination without a cursor`,
    );
  }
  throw err;
}
