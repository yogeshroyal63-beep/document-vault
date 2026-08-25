import type { Collection, Document } from "@prisma/client";
import type { GraphQLContext } from "../context.js";
import { ConflictError, NotFoundError, toAppError } from "../lib/errors.js";
import { assertNonEmpty, assertValidSlug } from "../lib/validation.js";

interface CreateCollectionInput {
  name: string;
  slug: string;
}

export const collectionQueries = {
  collections: async (
    _parent: unknown,
    _args: Record<string, never>,
    ctx: GraphQLContext,
  ): Promise<Collection[]> => {
    return ctx.prisma.collection.findMany({
      orderBy: { createdAt: "desc" },
    });
  },

  collection: async (
    _parent: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<Collection | null> => {
    return ctx.prisma.collection.findUnique({
      where: { id: args.id },
    });
  },
};

export const collectionMutations = {
  createCollection: async (
    _parent: unknown,
    args: { input: CreateCollectionInput },
    ctx: GraphQLContext,
  ): Promise<Collection> => {
    const name = assertNonEmpty(args.input.name, "name");
    const slug = assertValidSlug(args.input.slug);

    const existing = await ctx.prisma.collection.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictError(`a collection with slug "${slug}" already exists`);
    }

    // The findUnique check above is an optimistic pre-check for a fast,
    // friendly error in the common case — it is NOT what actually
    // guarantees uniqueness (the @unique constraint in schema.prisma does
    // that). Two concurrent requests can both pass the check above before
    // either inserts; the loser's create() then hits the real DB
    // constraint and throws a raw Prisma P2002, which toAppError maps
    // back to the same clean ConflictError instead of a raw 500.
    try {
      return await ctx.prisma.collection.create({
        data: { name, slug },
      });
    } catch (err) {
      toAppError(err, { entity: "collection" });
    }
  },
};

export const collectionFieldResolvers = {
  documents: async (
    parent: Collection,
    _args: Record<string, never>,
    ctx: GraphQLContext,
  ): Promise<Document[]> => {
    return ctx.prisma.document.findMany({
      where: { collectionId: parent.id },
      orderBy: { createdAt: "desc" },
    });
  },
};

/**
 * Shared helper: fetch a collection or throw NotFoundError. Used by
 * document resolvers (createDocument, moveDocument) that reference a
 * collectionId and need to fail cleanly on a bad reference.
 */
export async function requireCollection(
  ctx: GraphQLContext,
  collectionId: string,
): Promise<Collection> {
  const collection = await ctx.prisma.collection.findUnique({
    where: { id: collectionId },
  });
  if (!collection) {
    throw new NotFoundError("Collection", collectionId);
  }
  return collection;
}
