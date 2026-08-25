import { GraphQLError } from "graphql";

/**
 * Error codes surfaced to clients via `extensions.code`.
 * Kept small and explicit rather than reusing HTTP status names, since this
 * is a GraphQL API and callers should branch on these, not on transport codes.
 */
export type AppErrorCode =
  | "BAD_USER_INPUT"
  | "NOT_FOUND"
  | "CONFLICT";

/**
 * Base class for expected, user-facing failures (validation, missing
 * records, uniqueness conflicts). Resolvers throw these directly; GraphQL
 * Yoga serializes them as well-formed GraphQL errors instead of a generic
 * 500, because they already extend GraphQLError.
 *
 * Anything that is NOT an AppError (a real bug, a DB connection drop, etc.)
 * is deliberately left to propagate as-is so it still shows up as an
 * "INTERNAL_SERVER_ERROR" — we don't want to accidentally swallow real bugs
 * by making everything look like a clean user error.
 */
export class AppError extends GraphQLError {
  constructor(message: string, code: AppErrorCode) {
    super(message, { extensions: { code } });
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "BAD_USER_INPUT");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" was not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
    this.name = "ConflictError";
  }
}

/**
 * Narrow shape of Prisma's PrismaClientKnownRequestError — checked
 * structurally (duck-typed) rather than via `instanceof` so this file
 * doesn't need a runtime import of @prisma/client just to catch errors.
 */
interface PrismaKnownError {
  code: string;
  meta?: { target?: string[] };
}

function isPrismaKnownError(err: unknown): err is PrismaKnownError {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }
  return typeof err.code === "string";
}

/**
 * Maps a Prisma error thrown mid-request (typically a race lost between
 * an app-level check and the actual write — see createCollection's slug
 * check, or a concurrent delete during updateDocument/moveDocument) to
 * one of our clean AppError types, so a raw Prisma exception never
 * reaches the client as an opaque 500.
 *
 * Anything that isn't a recognized Prisma error code is rethrown as-is —
 * this function only translates the specific races this codebase is
 * exposed to, not a general Prisma error catch-all.
 */
export function toAppError(err: unknown, context: { entity: string; id?: string }): never {
  if (isPrismaKnownError(err)) {
    if (err.code === "P2002") {
      const field = err.meta?.target?.join(", ") ?? "field";
      throw new ConflictError(`a ${context.entity} with this ${field} already exists`);
    }
    if (err.code === "P2025") {
      throw new NotFoundError(context.entity, context.id ?? "unknown");
    }
    if (err.code === "P2003") {
      // Foreign key violation — the referenced row (e.g. a collectionId
      // that pointed at a now-deleted Collection) no longer exists.
      throw new NotFoundError(context.entity, context.id ?? "unknown");
    }
  }
  throw err;
}
