import type { Collection, Document, Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * A minimal in-memory stand-in for PrismaClient, used only in unit tests.
 *
 * This is intentionally NOT a mocking library (jest.mock / bun:test mock) —
 * it's a tiny hand-written fake that implements just the handful of
 * methods our resolvers call (findMany, findUnique, create, update,
 * delete), backed by plain arrays. That keeps unit tests fast, dependency
 * free, and focused on resolver logic (validation, error mapping,
 * pagination shape) rather than Prisma's query engine — which is instead
 * exercised for real in the integration test against Dockerized Postgres.
 */
export function createFakePrisma() {
  const collections: Collection[] = [];
  const documents: Document[] = [];

  /**
   * Narrows a Prisma string-filter field down to the lowercase
   * substring term, or null if the clause wasn't a contains filter.
   */
  function extractContainsTerm(
    field: string | Prisma.StringFilter<"Document"> | undefined,
  ): string | null {
    if (field === undefined || typeof field === "string") {
      return null;
    }

    if (typeof field.contains !== "string") {
      return null;
    }

    return field.contains.toLowerCase();
  }

  const collection = {
    findMany: async (): Promise<Collection[]> =>
      [...collections].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),

    findUnique: async (args: {
      where: { id?: string; slug?: string };
    }): Promise<Collection | null> => {
      if (args.where.id) {
        return collections.find((c) => c.id === args.where.id) ?? null;
      }

      if (args.where.slug) {
        return collections.find((c) => c.slug === args.where.slug) ?? null;
      }

      return null;
    },

    create: async (args: {
      data: { name: string; slug: string };
    }): Promise<Collection> => {
      const created: Collection = {
        id: randomUUID(),
        name: args.data.name,
        slug: args.data.slug,
        createdAt: new Date(),
      };

      collections.push(created);
      return created;
    },
  };

  const document = {
    findMany: async (args?: {
      where?: Prisma.DocumentWhereInput;
      take?: number;
      skip?: number;
      cursor?: { id: string };
    }): Promise<Document[]> => {
      let rows = [...documents];

      const where = args?.where;

      if (where?.collectionId) {
        rows = rows.filter((d) => d.collectionId === where.collectionId);
      }

      if (typeof where?.isArchived === "boolean") {
        rows = rows.filter((d) => d.isArchived === where.isArchived);
      }

      if (where?.OR) {
        const terms = where.OR;

        rows = rows.filter((d) =>
          terms.some((clause) => {
            const titleTerm = extractContainsTerm(clause.title);
            const contentTerm = extractContainsTerm(clause.content);

            return (
              (titleTerm !== null &&
                d.title.toLowerCase().includes(titleTerm)) ||
              (contentTerm !== null &&
                d.content.toLowerCase().includes(contentTerm))
            );
          }),
        );
      }

      rows.sort((a, b) => {
        const byDate = b.createdAt.getTime() - a.createdAt.getTime();

        if (byDate !== 0) {
          return byDate;
        }

        return b.id.localeCompare(a.id);
      });

      if (args?.cursor) {
        const idx = rows.findIndex((d) => d.id === args.cursor?.id);

        rows = idx === -1 ? [] : rows.slice(idx + (args.skip ?? 0));
      }

      if (typeof args?.take === "number") {
        rows = rows.slice(0, args.take);
      }

      return rows;
    },

    findUnique: async (args: {
      where: { id: string };
    }): Promise<Document | null> =>
      documents.find((d) => d.id === args.where.id) ?? null,

    create: async (args: {
      data: {
        title: string;
        content: string;
        collectionId: string;
        tags: string[];
      };
    }): Promise<Document> => {
      const created: Document = {
        id: randomUUID(),
        title: args.data.title,
        content: args.data.content,
        collectionId: args.data.collectionId,
        tags: args.data.tags,
        isArchived: false,
        createdAt: new Date(),
      };

      documents.push(created);
      return created;
    },

    update: async (args: {
      where: { id: string };
      data: Prisma.DocumentUpdateInput & {
        collection?: { connect: { id: string } };
      };
    }): Promise<Document> => {
      const idx = documents.findIndex((d) => d.id === args.where.id);

      if (idx === -1) {
        throw new Error("record not found");
      }

      const existing = documents[idx];

      if (!existing) {
        throw new Error("record not found");
      }

      const updated: Document = {
        ...existing,

        ...(args.data.title !== undefined
          ? { title: args.data.title as string }
          : {}),

        ...(args.data.content !== undefined
          ? { content: args.data.content as string }
          : {}),

        ...(args.data.tags !== undefined
          ? { tags: args.data.tags as string[] }
          : {}),

        ...(args.data.isArchived !== undefined
          ? { isArchived: args.data.isArchived as boolean }
          : {}),

        ...(args.data.collection?.connect?.id !== undefined
          ? { collectionId: args.data.collection.connect.id }
          : {}),
      };

      documents[idx] = updated;
      return updated;
    },

    delete: async (args: {
      where: { id: string };
    }): Promise<Document> => {
      const idx = documents.findIndex((d) => d.id === args.where.id);

      if (idx === -1) {
        throw new Error("record not found");
      }

      const [removed] = documents.splice(idx, 1);

      if (!removed) {
        throw new Error("record not found");
      }

      return removed;
    },
  };

  return { collection, document } as unknown as PrismaClient;
}