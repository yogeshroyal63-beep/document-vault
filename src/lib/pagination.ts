/**
 * Cursor pagination strategy: order rows by (createdAt desc, id desc) for a
 * stable total order (createdAt alone can collide), fetch `take + 1` rows,
 * and use the extra row only to decide `hasMore` — it is never returned to
 * the caller. `nextCursor` is the id of the last *returned* row; Prisma's
 * `cursor: { id }` + `skip: 1` combo then resumes exactly after that row.
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
