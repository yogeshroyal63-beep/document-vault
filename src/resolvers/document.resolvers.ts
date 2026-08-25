import type { Collection, Document, Prisma } from "@prisma/client";
import type { GraphQLContext } from "../context.js";
import { NotFoundError, toAppError } from "../lib/errors.js";
import { paginate, resolveCursorError, type PageResult } from "../lib/pagination.js";
import { assertNonEmpty, assertValidTags } from "../lib/validation.js";
import { resolveTake } from "../lib/validation.js";
import { requireCollection } from "./collection.resolvers.js";

interface DocumentsArgs {
  collectionId?: string | null;
  search?: string | null;
  isArchived?: boolean | null;
  take?: number | null;
  cursor?: string | null;
}

interface CreateDocumentInput {
  title: string;
  content: string;
  collectionId: string;
  tags?: string[] | null;
}

interface UpdateDocumentInput {
  title?: string | null;
  content?: string | null;
  tags?: string[] | null;
  isArchived?: boolean | null;
}

export const documentQueries = {
  documents: async (
    _parent: unknown,
    args: DocumentsArgs,
    ctx: GraphQLContext,
  ): Promise<PageResult<Document>> => {
    const take = resolveTake(args.take);

    const where: Prisma.DocumentWhereInput = {};

    if (args.collectionId) {
      where.collectionId = args.collectionId;
    }
    if (typeof args.isArchived === "boolean") {
      where.isArchived = args.isArchived;
    }
    if (args.search && args.search.trim().length > 0) {
      const term = args.search.trim();
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { content: { contains: term, mode: "insensitive" } },
      ];
    }

    let rows: Document[];
    try {
      rows = await ctx.prisma.document.findMany({
        where,
        // Ordered by (createdAt desc, id desc) so the sort order is total
        // and stable even when multiple documents share a createdAt value —
        // required for cursor pagination to never skip or repeat a row.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(args.cursor
          ? { cursor: { id: args.cursor }, skip: 1 }
          : {}),
      });
    } catch (err) {
      if (args.cursor) {
        resolveCursorError(err, args.cursor);
      }
      throw err;
    }

    return paginate(rows, take);
  },
};

export const documentMutations = {
  createDocument: async (
    _parent: unknown,
    args: { input: CreateDocumentInput },
    ctx: GraphQLContext,
  ): Promise<Document> => {
    const title = assertNonEmpty(args.input.title, "title");
    const content = assertNonEmpty(args.input.content, "content");
    const tags = assertValidTags(args.input.tags);
    await requireCollection(ctx, args.input.collectionId);

    // requireCollection above is a friendly pre-check; the foreign key
    // constraint in the DB is what actually enforces it. If the
    // collection is deleted in the gap between that check and this
    // insert, Postgres raises a foreign-key violation (P2003), which
    // toAppError maps to a clean NotFoundError instead of a raw 500.
    try {
      return await ctx.prisma.document.create({
        data: {
          title,
          content,
          collectionId: args.input.collectionId,
          tags,
        },
      });
    } catch (err) {
      return toAppError(err, { entity: "Collection", id: args.input.collectionId });
    }
  },

  updateDocument: async (
    _parent: unknown,
    args: { id: string; input: UpdateDocumentInput },
    ctx: GraphQLContext,
  ): Promise<Document> => {
    await requireDocument(ctx, args.id);

    const data: Prisma.DocumentUpdateInput = {};

    if (args.input.title !== undefined && args.input.title !== null) {
      data.title = assertNonEmpty(args.input.title, "title");
    }
    if (args.input.content !== undefined && args.input.content !== null) {
      data.content = assertNonEmpty(args.input.content, "content");
    }
    if (args.input.tags !== undefined && args.input.tags !== null) {
      data.tags = assertValidTags(args.input.tags);
    }
    if (args.input.isArchived !== undefined && args.input.isArchived !== null) {
      data.isArchived = args.input.isArchived;
    }

    return updateDocumentSafely(ctx, args.id, data);
  },

  deleteDocument: async (
    _parent: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<boolean> => {
    await requireDocument(ctx, args.id);
    try {
      await ctx.prisma.document.delete({ where: { id: args.id } });
    } catch (err) {
      toAppError(err, { entity: "Document", id: args.id });
    }
    return true;
  },

  moveDocument: async (
    _parent: unknown,
    args: { id: string; collectionId: string },
    ctx: GraphQLContext,
  ): Promise<Document> => {
    await requireDocument(ctx, args.id);
    await requireCollection(ctx, args.collectionId);

    // Prisma's generated DocumentUpdateInput only exposes the relation
    // field (`collection`) for reassigning a foreign key on update, not
    // the flat scalar (`collectionId`) — that shortcut only exists on
    // *CreateInput types. `connect` is the standard Prisma relation
    // syntax for "point this row's FK at a different existing row".
    return updateDocumentSafely(ctx, args.id, {
      collection: { connect: { id: args.collectionId } },
    });
  },
};

export const documentFieldResolvers = {
  collection: async (
    parent: Document,
    _args: Record<string, never>,
    ctx: GraphQLContext,
  ): Promise<Collection> => {
    // Guaranteed to exist: collectionId is a required, foreign-keyed field,
    // so a missing collection here would mean referential integrity was
    // already broken elsewhere — worth a loud failure, not a silent null.
    const collection = await ctx.prisma.collection.findUnique({
      where: { id: parent.collectionId },
    });
    if (!collection) {
      throw new NotFoundError("Collection", parent.collectionId);
    }
    return collection;
  },
};

async function requireDocument(ctx: GraphQLContext, id: string): Promise<Document> {
  const document = await ctx.prisma.document.findUnique({ where: { id } });
  if (!document) {
    throw new NotFoundError("Document", id);
  }
  return document;
}

/**
 * Wraps document.update() so a race lost between the caller's
 * requireDocument() check and this write (the record gets deleted in
 * between) surfaces as our clean NotFoundError instead of a raw Prisma
 * P2025 exception. Shared by updateDocument and moveDocument, which are
 * the two mutations that write to an already-checked document.
 */
async function updateDocumentSafely(
  ctx: GraphQLContext,
  id: string,
  data: Prisma.DocumentUpdateInput,
): Promise<Document> {
  try {
    return await ctx.prisma.document.update({ where: { id }, data });
  } catch (err) {
    return toAppError(err, { entity: "Document", id });
  }
}