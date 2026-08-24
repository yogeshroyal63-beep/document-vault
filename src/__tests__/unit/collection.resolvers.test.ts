/* eslint-disable @typescript-eslint/await-thenable */

import { describe, expect, test } from "bun:test";
import { collectionMutations, collectionQueries } from "../../resolvers/collection.resolvers.js";
import { createFakePrisma } from "./fakePrisma.js";
import { ConflictError, ValidationError } from "../../lib/errors.js";
import type { GraphQLContext } from "../../context.js";

function ctx(): GraphQLContext {
  return { prisma: createFakePrisma() };
}

describe("createCollection", () => {
  test("creates a collection with a valid name and slug", async () => {
    const c = ctx();
    const result = await collectionMutations.createCollection(
      null,
      { input: { name: "Invoices", slug: "invoices" } },
      c,
    );
    expect(result.name).toBe("Invoices");
    expect(result.slug).toBe("invoices");
    expect(result.id).toBeTruthy();
  });

  test("rejects an empty name", async () => {
    const c = ctx();
    await expect(
      collectionMutations.createCollection(null, { input: { name: "", slug: "invoices" } }, c),
    ).rejects.toThrow(ValidationError);
  });

  test("rejects a malformed slug", async () => {
    const c = ctx();
    await expect(
      collectionMutations.createCollection(
        null,
        { input: { name: "Invoices", slug: "Not A Slug" } },
        c,
      ),
    ).rejects.toThrow(ValidationError);
  });

  test("rejects a duplicate slug", async () => {
    const c = ctx();
    await collectionMutations.createCollection(
      null,
      { input: { name: "Invoices", slug: "invoices" } },
      c,
    );
    await expect(
      collectionMutations.createCollection(
        null,
        { input: { name: "Invoices 2026", slug: "invoices" } },
        c,
      ),
    ).rejects.toThrow(ConflictError);
  });
});

describe("collections query", () => {
  test("returns an empty list when no collections exist", async () => {
    const c = ctx();
    const result = await collectionQueries.collections(null, {}, c);
    expect(result).toEqual([]);
  });

  test("returns created collections", async () => {
    const c = ctx();
    await collectionMutations.createCollection(null, { input: { name: "A", slug: "a" } }, c);
    await collectionMutations.createCollection(null, { input: { name: "B", slug: "b" } }, c);
    const result = await collectionQueries.collections(null, {}, c);
    expect(result).toHaveLength(2);
  });
});

describe("collection(id) query", () => {
  test("returns null for an unknown id", async () => {
    const c = ctx();
    const result = await collectionQueries.collection(null, { id: "does-not-exist" }, c);
    expect(result).toBeNull();
  });

  test("returns the matching collection", async () => {
    const c = ctx();
    const created = await collectionMutations.createCollection(
      null,
      { input: { name: "Invoices", slug: "invoices" } },
      c,
    );
    const result = await collectionQueries.collection(null, { id: created.id }, c);
    expect(result?.id).toBe(created.id);
  });
});
