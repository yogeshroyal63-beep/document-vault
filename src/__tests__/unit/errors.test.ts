import { describe, expect, test } from "bun:test";
import { toAppError, ConflictError, NotFoundError } from "../../lib/errors.js";

/** Minimal stand-in for Prisma's PrismaClientKnownRequestError shape. */
function prismaError(code: string, meta?: { target?: string[] }): unknown {
  return { code, meta };
}

describe("toAppError", () => {
  test("maps P2002 (unique constraint) to ConflictError", () => {
    expect(() => toAppError(prismaError("P2002", { target: ["slug"] }), { entity: "collection" })).toThrow(
      ConflictError,
    );
  });

  test("P2002 error message includes the conflicting field", () => {
    expect(() =>
      toAppError(prismaError("P2002", { target: ["slug"] }), { entity: "collection" }),
    ).toThrow(/slug/);
  });

  test("maps P2025 (record not found) to NotFoundError", () => {
    expect(() => toAppError(prismaError("P2025"), { entity: "Document", id: "abc" })).toThrow(
      NotFoundError,
    );
  });

  test("maps P2003 (foreign key violation) to NotFoundError", () => {
    expect(() => toAppError(prismaError("P2003"), { entity: "Collection", id: "abc" })).toThrow(
      NotFoundError,
    );
  });

  test("rethrows unrecognized errors as-is", () => {
    const original = new Error("connection dropped");
    expect(() => toAppError(original, { entity: "Document" })).toThrow(original);
  });

  test("rethrows non-Prisma-shaped values as-is", () => {
    expect(() => toAppError("a plain string error", { entity: "Document" })).toThrow(
      "a plain string error",
    );
  });
});
