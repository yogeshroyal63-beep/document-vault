import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient instance.
 *
 * `bun run --watch` re-executes the module graph on every file change,
 * which would otherwise create a fresh PrismaClient (and a fresh pool of
 * DB connections) on every reload. Stashing the instance on `globalThis`
 * survives the reload and keeps the connection pool stable — the same
 * pattern commonly used for Next.js dev servers.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
