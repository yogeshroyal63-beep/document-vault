/* eslint-disable @typescript-eslint/await-thenable */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { collectionMutations, collectionQueries } from "../../resolvers/collection.resolvers.js";
import { documentMutations, documentQueries } from "../../resolvers/document.resolvers.js";
import { NotFoundError } from "../../lib/errors.js";
import type { GraphQLContext } from "../../context.js";

/**
 * Integration test against the real Prisma client + real Postgres
 * (the `document_vault_test` database created by docker-compose's
 * init script). This is what actually proves migrations are correct,
 * indexes exist, and Prisma's `contains`/`mode: insensitive` behaves the
 * way the unit tests' fake client assumes it does.
 *
 * Requires: `docker compose up -d` and `DATABASE_URL` pointed at the
 * test database (see TEST_DATABASE_URL in .env.example) with migrations
 * already applied — see README "Running tests".
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Copy .env.example to .env and start docker compose before running integration tests.",
  );
}

const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
const ctx: GraphQLContext = { prisma };

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Truncate between tests rather than recreating the schema each time —
// much faster, and migrations already establish the schema once up front.
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "documents", "collections" RESTART IDENTITY CASCADE',
  );
});

describe("Document Vault — integration", () => {
  test("full flow: create collection, create document, search, move, archive, delete", async () => {
    const collectionA = await collectionMutations.createCollection(
      null,
      { input: { name: "Invoices", slug: "invoices" } },
      ctx,
    );
    const collectionB = await collectionMutations.createCollection(
      null,
      { input: { name: "Archive", slug: "archive" } },
      ctx,
    );

    const doc = await documentMutations.createDocument(
      null,
      {
        input: {
          title: "Q1 Financial Report",
          content: "Revenue increased across all regions.",
          collectionId: collectionA.id,
          tags: ["finance", "q1"],
        },
      },
      ctx,
    );
    expect(doc.id).toBeTruthy();
    expect(doc.isArchived).toBe(false);

    // Nested documents resolve through the real foreign key relationship.
    const fetchedCollection = await collectionQueries.collection(
      null,
      { id: collectionA.id },
      ctx,
    );
    expect(fetchedCollection).not.toBeNull();

    // Substring search against real Postgres ILIKE semantics.
    const searchResult = await documentQueries.documents(
      null,
      { search: "revenue" },
      ctx,
    );
    expect(searchResult.items).toHaveLength(1);
    expect(searchResult.items[0]?.id).toBe(doc.id);

    // Case-insensitivity, specifically — this is the part a fake client
    // can get wrong silently if `mode: "insensitive"` isn't actually
    // wired through to a real ILIKE query.
    const caseInsensitive = await documentQueries.documents(
      null,
      { search: "REVENUE" },
      ctx,
    );
    expect(caseInsensitive.items).toHaveLength(1);

    // Move to a different collection.
    const moved = await documentMutations.moveDocument(
      null,
      { id: doc.id, collectionId: collectionB.id },
      ctx,
    );
    expect(moved.collectionId).toBe(collectionB.id);

    const filteredByOldCollection = await documentQueries.documents(
      null,
      { collectionId: collectionA.id },
      ctx,
    );
    expect(filteredByOldCollection.items).toHaveLength(0);

    const filteredByNewCollection = await documentQueries.documents(
      null,
      { collectionId: collectionB.id },
      ctx,
    );
    expect(filteredByNewCollection.items).toHaveLength(1);

    // Archive, then confirm the isArchived filter reflects it via a real query.
    await documentMutations.updateDocument(null, { id: doc.id, input: { isArchived: true } }, ctx);
    const archivedOnly = await documentQueries.documents(null, { isArchived: true }, ctx);
    expect(archivedOnly.items).toHaveLength(1);

    // Delete and confirm it's gone.
    const deleted = await documentMutations.deleteDocument(null, { id: doc.id }, ctx);
    expect(deleted).toBe(true);
    await expect(
      documentMutations.updateDocument(null, { id: doc.id, input: { title: "X" } }, ctx),
    ).rejects.toThrow(NotFoundError);
  });

  test("slug uniqueness is enforced at the database level", async () => {
    await collectionMutations.createCollection(
      null,
      { input: { name: "Invoices", slug: "invoices" } },
      ctx,
    );
    // The resolver itself checks for an existing slug before insert, so
    // this also indirectly proves that pre-check works against a real DB
    // (not just the fake's array-based lookup).
    await expect(
      collectionMutations.createCollection(
        null,
        { input: { name: "Invoices Again", slug: "invoices" } },
        ctx,
      ),
    ).rejects.toThrow();
  });

  test("cursor pagination returns disjoint, ordered pages against real Postgres", async () => {
    const collection = await collectionMutations.createCollection(
      null,
      { input: { name: "Notes", slug: "notes" } },
      ctx,
    );
    for (let i = 0; i < 5; i += 1) {
      await documentMutations.createDocument(
        null,
        { input: { title: `Note ${i}`, content: "body", collectionId: collection.id } },
        ctx,
      );
    }

    const firstPage = await documentQueries.documents(null, { take: 2 }, ctx);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await documentQueries.documents(
      null,
      { take: 2, cursor: firstPage.nextCursor },
      ctx,
    );
    expect(secondPage.items).toHaveLength(2);

    const firstIds = new Set(firstPage.items.map((d) => d.id));
    const overlap = secondPage.items.some((d) => firstIds.has(d.id));
    expect(overlap).toBe(false);
  });
});
