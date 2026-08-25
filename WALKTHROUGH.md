# Walkthrough

This is a written walkthrough of the implementation and key decisions,
covering what a 5–10 min video would. (If a video is still expected, this
doc is the script — happy to record over it.)

## What it does

A GraphQL API for organizing documents into collections: create/manage
both, move a document between collections, search by substring on
title/content, filter by collection or archived state, fetch a collection
with its nested documents, and paginate documents with a cursor.

## Structure

```
prisma/schema.prisma          Data model + indexes
src/schema/schema.graphql     GraphQL contract (SDL, schema-first)
src/schema/index.ts           Wires SDL + resolvers into an executable schema
src/resolvers/                One file per domain area (collection, document)
src/lib/                      errors.ts, validation.ts, pagination.ts, prisma.ts
src/context.ts                GraphQL context (wraps the Prisma client)
src/index.ts                  Server entrypoint (GraphQL Yoga + Bun.serve)
src/__tests__/unit/           Fast tests against an in-memory fake Prisma client
src/__tests__/integration/    Real Prisma client against Dockerized Postgres
```

## Key decisions, and why

**Schema-first, not code-first.** The assignment asked for a `.graphql`
file + resolvers specifically, so `schema.graphql` is the single source of
truth for the API contract, and resolvers are typed against it by hand
(no codegen) — deliberately, to keep the dependency surface small for a
project this size.

**Prisma pinned to 6.19.3, not 7.** Prisma 7 shipped after I'd started and
changes how the client connects to the database (datasource URLs move out
of `schema.prisma` into a new `prisma.config.ts`, and it now wants a
driver adapter like `@prisma/adapter-pg` instead of the classic engine).
That's a reasonable direction for Prisma to take, but it's a meaningfully
different setup from what most current tutorials/docs assume, and I'd
rather hand over something that behaves exactly the way the ecosystem
currently expects than something correct-but-unfamiliar. 6.19.3 is the
last stable release on the pre-7 line.

**Error handling.** Every resolver that can fail on bad input or a missing
record throws a typed error (`ValidationError`, `NotFoundError`,
`ConflictError`) that extends `GraphQLError` directly, so GraphQL Yoga
serializes it as a proper GraphQL error with an `extensions.code` — never
a bare 500. Anything *not* wrapped in one of those types (a real bug, a
dropped DB connection) is left alone and surfaces as
`INTERNAL_SERVER_ERROR`, on purpose — I didn't want a blanket try/catch
that quietly turns real bugs into clean-looking user errors.

**`updateDocument` fetches the record before updating it**, even though
Prisma's own `update` would throw on a missing row anyway (a `P2025`
error). That's so the error the client sees is our clean `NotFoundError`
with a real code, not a raw Prisma exception. Same pattern in
`deleteDocument` and `moveDocument`.

**Cursor pagination** orders by `(createdAt desc, id desc)`, not
`createdAt` alone. `createdAt` isn't guaranteed unique — two documents
created in the same request or the same millisecond in a bulk import
would collide — and a non-unique sort key can cause a cursor page to skip
or repeat rows. Adding `id` as a tiebreaker makes the order total. The
implementation fetches `take + 1` rows and uses the extra one only to
compute `hasMore`, never returning it (`src/lib/pagination.ts`).

**Slug validation** is deliberately explicit rather than assumed: the
assignment says reject malformed slugs but doesn't define the format, so
I picked lowercase kebab-case (`quarterly-reports-2026`) and said so in
the README, rather than silently picking a convention and hoping it
matches expectations.

**Cascade delete on `Collection → Document`** — deleting a collection
takes its documents with it. This wasn't specified either way; I picked
the simpler option within scope and documented the tradeoff (a `Restrict`
policy, forcing documents to be moved out first, is the safer alternative
for a real product and is a one-line schema change).

**Concurrent-request races are mapped to clean errors.** A pre-check like
"does this slug already exist" is a fast path, not the actual guarantee —
the DB's unique/foreign-key constraints are. If two requests race and the
loser's write then hits a real constraint violation, `toAppError`
(`src/lib/errors.ts`) maps Prisma's error codes back to the same clean
error types the pre-check would have thrown, so a lost race never looks
like a server crash to the client.

**Cursor pagination handles a deleted cursor row.** Prisma resolves a
`cursor: { id }` argument by looking up that row's position first; if the
row was deleted since the previous page was fetched, that lookup fails.
`resolveCursorError` turns that into a clear, actionable
`BAD_USER_INPUT` error instead of an opaque failure.

## Testing approach

Two layers, deliberately different in what they verify:

1. **Unit tests** (65 tests, all passing) run resolver logic against a
   small hand-written in-memory fake of the Prisma client
   (`fakePrisma.ts`) — fast, no database, and focused on validation logic,
   error mapping, and pagination shape. While building this I actually
   caught a real bug this way: the fake's `update()` method didn't handle
   the `collectionId` field, which made `moveDocument`'s unit test fail
   even though the real resolver was correct — a good example of exactly
   what unit tests are supposed to catch, just in the test scaffolding
   instead of the implementation this time. I later ran a second,
   deliberate audit pass over the whole codebase looking specifically for
   bugs rather than re-confirming what I already believed was correct —
   that pass found and fixed the concurrent-request race handling and the
   deleted-cursor-row handling described above, plus added tag validation
   (empty/oversized/duplicate tags) that had been accepted silently
   before. New tests cover all of it (`errors.test.ts`, and the tag cases
   in `validation.test.ts`).

2. **Integration test** runs the real Prisma client against the
   Dockerized Postgres instance (a separate `document_vault_test`
   database), exercising a full flow — create collection → create
   document → search → move → archive → delete — plus a dedicated
   case-insensitive search check and a cursor-pagination check. This is
   the layer that actually proves the migrations are correct and that
   Postgres's `ILIKE` behaves the way the unit tests' fake assumes.

## Honest caveat on what I could verify directly

I built the initial version without a live Bun runtime or Docker daemon
available in my own environment, so at that point I verified what I could
indirectly: I ran the resolver test suite through a temporary Node/Vitest
shim mapping `bun:test`'s API (which is how I caught the `moveDocument`
bug above), and ran `tsc --noEmit` / `eslint` against the real code using
a hand-written type stub matching Prisma's generated types, since
generating the real client requires a binary download my environment
couldn't reach.

At that stage `prisma/migrations/` didn't exist yet in the repo — it
needed a real `prisma migrate dev` against a real Postgres instance,
which I couldn't run myself. That's since been done for real, locally,
against Docker Postgres, and the resulting migration
(`prisma/migrations/20260824164629_init/migration.sql`) is committed —
I checked its contents and confirmed it matches `schema.prisma` exactly:
both tables, the unique slug constraint, both indexes, and the cascade
foreign key. That was the one piece I couldn't produce myself, and it's
now real.

The audit pass (the race-condition and cursor-deletion fixes described
above) was verified the same indirect way as the initial build — Node/
Vitest shim for the test suite, stub types for `tsc`/`eslint` — since I
still don't have a live Bun+Postgres environment. The integration test
itself has still not been executed by me directly; I'd treat running
`bun run test:integration` as the next thing to confirm, if it hasn't
been run since these changes.
