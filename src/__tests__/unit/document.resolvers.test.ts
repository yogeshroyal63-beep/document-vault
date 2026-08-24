/* eslint-disable @typescript-eslint/await-thenable */

import { describe, expect, test } from "bun:test";
import { collectionMutations } from "../../resolvers/collection.resolvers.js";
import { documentMutations, documentQueries } from "../../resolvers/document.resolvers.js";
import { createFakePrisma } from "./fakePrisma.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import type { GraphQLContext } from "../../context.js";
import type { Collection } from "@prisma/client";

async function ctxWithCollection(): Promise<{ ctx: GraphQLContext; collection: Collection }> {
  const ctx: GraphQLContext = { prisma: createFakePrisma() };
  const collection = await collectionMutations.createCollection(
    null,
    { input: { name: "Invoices", slug: "invoices" } },
    ctx,
  );
  return { ctx, collection };
}

describe("createDocument", () => {
  test("creates a document with defaults", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "Q1 report", content: "revenue up", collectionId: collection.id } },
      ctx,
    );
    expect(doc.title).toBe("Q1 report");
    expect(doc.isArchived).toBe(false);
    expect(doc.tags).toEqual([]);
  });

  test("stores provided tags", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      {
        input: {
          title: "Q1 report",
          content: "revenue up",
          collectionId: collection.id,
          tags: ["finance", "q1"],
        },
      },
      ctx,
    );
    expect(doc.tags).toEqual(["finance", "q1"]);
  });

  test("rejects an empty title", async () => {
    const { ctx, collection } = await ctxWithCollection();
    await expect(
      documentMutations.createDocument(
        null,
        { input: { title: "", content: "revenue up", collectionId: collection.id } },
        ctx,
      ),
    ).rejects.toThrow(ValidationError);
  });

  test("rejects empty content", async () => {
    const { ctx, collection } = await ctxWithCollection();
    await expect(
      documentMutations.createDocument(
        null,
        { input: { title: "Q1 report", content: "  ", collectionId: collection.id } },
        ctx,
      ),
    ).rejects.toThrow(ValidationError);
  });

  test("rejects an unknown collectionId", async () => {
    const ctx: GraphQLContext = { prisma: createFakePrisma() };
    await expect(
      documentMutations.createDocument(
        null,
        { input: { title: "Q1 report", content: "revenue up", collectionId: "missing" } },
        ctx,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("updateDocument", () => {
  test("updates only the provided fields", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "Old title", content: "body", collectionId: collection.id } },
      ctx,
    );
    const updated = await documentMutations.updateDocument(
      null,
      { id: doc.id, input: { title: "New title" } },
      ctx,
    );
    expect(updated.title).toBe("New title");
    expect(updated.content).toBe("body");
  });

  test("can archive a document", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "T", content: "C", collectionId: collection.id } },
      ctx,
    );
    const updated = await documentMutations.updateDocument(
      null,
      { id: doc.id, input: { isArchived: true } },
      ctx,
    );
    expect(updated.isArchived).toBe(true);
  });

  test("rejects clearing the title to empty", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "T", content: "C", collectionId: collection.id } },
      ctx,
    );
    await expect(
      documentMutations.updateDocument(null, { id: doc.id, input: { title: "" } }, ctx),
    ).rejects.toThrow(ValidationError);
  });

  test("throws NotFoundError for an unknown document id", async () => {
    const { ctx } = await ctxWithCollection();
    await expect(
      documentMutations.updateDocument(null, { id: "missing", input: { title: "X" } }, ctx),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("deleteDocument", () => {
  test("deletes an existing document and returns true", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "T", content: "C", collectionId: collection.id } },
      ctx,
    );
    const result = await documentMutations.deleteDocument(null, { id: doc.id }, ctx);
    expect(result).toBe(true);
  });

  test("throws NotFoundError for an unknown id", async () => {
    const { ctx } = await ctxWithCollection();
    await expect(documentMutations.deleteDocument(null, { id: "missing" }, ctx)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("moveDocument", () => {
  test("moves a document to a different collection", async () => {
    const { ctx, collection: source } = await ctxWithCollection();
    const target = await collectionMutations.createCollection(
      null,
      { input: { name: "Archive", slug: "archive" } },
      ctx,
    );
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "T", content: "C", collectionId: source.id } },
      ctx,
    );
    const moved = await documentMutations.moveDocument(
      null,
      { id: doc.id, collectionId: target.id },
      ctx,
    );
    expect(moved.collectionId).toBe(target.id);
  });

  test("throws NotFoundError when target collection does not exist", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "T", content: "C", collectionId: collection.id } },
      ctx,
    );
    await expect(
      documentMutations.moveDocument(null, { id: doc.id, collectionId: "missing" }, ctx),
    ).rejects.toThrow(NotFoundError);
  });

  test("throws NotFoundError when document does not exist", async () => {
    const { ctx, collection } = await ctxWithCollection();
    await expect(
      documentMutations.moveDocument(null, { id: "missing", collectionId: collection.id }, ctx),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("documents query — search and filters", () => {
  test("substring-matches on title, case-insensitive", async () => {
    const { ctx, collection } = await ctxWithCollection();
    await documentMutations.createDocument(
      null,
      { input: { title: "Quarterly Report", content: "numbers", collectionId: collection.id } },
      ctx,
    );
    await documentMutations.createDocument(
      null,
      { input: { title: "Meeting notes", content: "numbers", collectionId: collection.id } },
      ctx,
    );
    const page = await documentQueries.documents(null, { search: "quarterly" }, ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe("Quarterly Report");
  });

  test("substring-matches on content", async () => {
    const { ctx, collection } = await ctxWithCollection();
    await documentMutations.createDocument(
      null,
      { input: { title: "A", content: "contains apples", collectionId: collection.id } },
      ctx,
    );
    await documentMutations.createDocument(
      null,
      { input: { title: "B", content: "contains oranges", collectionId: collection.id } },
      ctx,
    );
    const page = await documentQueries.documents(null, { search: "apples" }, ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe("A");
  });

  test("filters by collectionId", async () => {
    const { ctx, collection: colA } = await ctxWithCollection();
    const colB = await collectionMutations.createCollection(
      null,
      { input: { name: "B", slug: "b" } },
      ctx,
    );
    await documentMutations.createDocument(
      null,
      { input: { title: "In A", content: "x", collectionId: colA.id } },
      ctx,
    );
    await documentMutations.createDocument(
      null,
      { input: { title: "In B", content: "x", collectionId: colB.id } },
      ctx,
    );
    const page = await documentQueries.documents(null, { collectionId: colA.id }, ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe("In A");
  });

  test("filters by isArchived", async () => {
    const { ctx, collection } = await ctxWithCollection();
    const doc = await documentMutations.createDocument(
      null,
      { input: { title: "T", content: "C", collectionId: collection.id } },
      ctx,
    );
    await documentMutations.updateDocument(null, { id: doc.id, input: { isArchived: true } }, ctx);
    await documentMutations.createDocument(
      null,
      { input: { title: "Active", content: "C", collectionId: collection.id } },
      ctx,
    );

    const archived = await documentQueries.documents(null, { isArchived: true }, ctx);
    expect(archived.items).toHaveLength(1);
    expect(archived.items[0]?.title).toBe("T");

    const active = await documentQueries.documents(null, { isArchived: false }, ctx);
    expect(active.items).toHaveLength(1);
    expect(active.items[0]?.title).toBe("Active");
  });
});

describe("documents query — pagination", () => {
  test("respects the take argument and reports hasMore", async () => {
    const { ctx, collection } = await ctxWithCollection();
    for (let i = 0; i < 5; i += 1) {
      await documentMutations.createDocument(
        null,
        { input: { title: `Doc ${i}`, content: "x", collectionId: collection.id } },
        ctx,
      );
    }
    const page = await documentQueries.documents(null, { take: 2 }, ctx);
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  test("cursor resumes after the last item of the previous page", async () => {
    const { ctx, collection } = await ctxWithCollection();
    for (let i = 0; i < 5; i += 1) {
      await documentMutations.createDocument(
        null,
        { input: { title: `Doc ${i}`, content: "x", collectionId: collection.id } },
        ctx,
      );
    }
    const firstPage = await documentQueries.documents(null, { take: 2 }, ctx);
    const secondPage = await documentQueries.documents(
      null,
      { take: 2, cursor: firstPage.nextCursor },
      ctx,
    );

    const firstIds = firstPage.items.map((d) => d.id);
    const secondIds = secondPage.items.map((d) => d.id);
    // No overlap between pages.
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  test("hasMore is false on the last page", async () => {
    const { ctx, collection } = await ctxWithCollection();
    for (let i = 0; i < 3; i += 1) {
      await documentMutations.createDocument(
        null,
        { input: { title: `Doc ${i}`, content: "x", collectionId: collection.id } },
        ctx,
      );
    }
    const page = await documentQueries.documents(null, { take: 10 }, ctx);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  test("rejects take of 0", async () => {
    const { ctx } = await ctxWithCollection();
    await expect(documentQueries.documents(null, { take: 0 }, ctx)).rejects.toThrow(
      ValidationError,
    );
  });
});
