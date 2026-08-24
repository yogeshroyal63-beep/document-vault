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
