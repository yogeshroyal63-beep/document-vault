import type { PrismaClient } from "@prisma/client";
import { prisma } from "./lib/prisma.js";

/**
 * GraphQL context. Just wraps the Prisma client for now — kept as an
 * object rather than importing `prisma` directly in resolvers so tests can
 * inject a different client (e.g. pointed at the test database) without
 * any resolver code changes.
 */
export interface GraphQLContext {
  prisma: PrismaClient;
}

export function createContext(): GraphQLContext {
  return { prisma };
}
