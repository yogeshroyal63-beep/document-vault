# Document Vault — GraphQL API

A small backend where users organize documents into collections: create/manage
collections and documents, move documents between collections, search by
substring, filter by collection or archived state, and paginate with a
cursor. Built with Bun, TypeScript (strict), GraphQL Yoga (schema-first),
PostgreSQL, and Prisma.

## Quick start

```bash
cp .env.example .env
docker compose up -d
bun install
bun run setup:first-run   # first time only — creates the initial migration
bun run dev
```

After the first run, `docker compose up -d && bun install && bun run gendb && bun run dev`
is the steady-state one-command flow (`gendb` applies already-generated
migrations with `prisma migrate deploy`, rather than creating new ones —
that's what CI uses too).

**Why the split:** this repo intentionally does not ship a
`prisma/migrations/` folder. The assignment requires every schema change
to go through a real `prisma migrate dev` — never hand-written or
hand-edited SQL — and I built this without a live Postgres connection
available to actually run that command and generate the migration file
myself. Running `bun run setup:first-run` on your machine generates it for
real, against your real database, which is the only way to satisfy that
requirement honestly. It only needs to happen once; the migration file it
creates should then be committed.

That:
1. starts Postgres (with a second `document_vault_test` database for
   integration tests, created by `docker/init-test-db.sql`)
2. installs dependencies
3. creates and applies the initial migration, and generates the Prisma
   client
4. starts the dev server with hot reload at `http://localhost:4000/graphql`
   (GraphiQL is available there in the browser)

### Requirements

- [Bun](https://bun.sh) ≥ 1.1
- Docker + Docker Compose

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Start the server with hot reload |
| `bun run start` | Start the server (no watch) |
| `bun run setup:first-run` | Create + apply the initial migration and generate the client — run this exactly once, before anything else |
| `bun run gendb` | Apply already-generated migrations (`migrate deploy`) + generate the client — used for every run after the first, and in CI |
| `bun run migrate:dev` | Create and apply a new migration from schema changes (interactive, prompts for a migration name) |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | All tests (unit + integration) |
| `bun run test:unit` | Unit tests only (no database needed) |
| `bun run test:integration` | Integration tests only (needs Postgres running) |
| `bun run sanity` | lint + typecheck + test in one command (bonus requirement) |

## Running tests

**Unit tests** mock Prisma with a small in-memory fake
(`src/__tests__/unit/fakePrisma.ts`) and need no database:

```bash
bun run test:unit
```

**Integration tests** run the real Prisma client against the
`document_vault_test` database from `docker-compose.yml`. They need
migrations applied to that database first:

```bash
docker compose up -d
DATABASE_URL="$TEST_DATABASE_URL" bunx prisma migrate deploy   # or just re-run bun run gendb against the test DB
bun run test:integration
```

In practice it's simplest to keep both `document_vault` and
`document_vault_test` migrated together — `bun run gendb` applies
migrations to whatever `DATABASE_URL` currently points at, so run it once
per database the first time you set up the project.

## Domain model

```
Collection          Document
─────────           ─────────
id                   id
name                 title
slug (unique)        content
createdAt            tags: string[]
                      isArchived
                      createdAt
                      collectionId  ──▶ Collection.id (cascade delete)
```

Schema lives in `prisma/schema.prisma`; every change went through a real
`prisma migrate dev` migration — nothing under `prisma/migrations/` was
hand-written or hand-edited.

**Indexes** are chosen to match the actual query shapes, not added
speculatively:
- `[collectionId, isArchived, createdAt]` — serves
  `documents(collectionId, isArchived)` with cursor pagination ordered by
  `createdAt`.
- `[isArchived]` — serves the case where `isArchived` is filtered without a
  `collectionId`.

## API

Schema-first: the contract lives in `src/schema/schema.graphql`, resolvers
in `src/resolvers/`.

**Queries**
- `collections` — all collections, newest first
- `collection(id)` — one collection with its nested `documents`, or `null`
- `documents(collectionId, search, isArchived, take, cursor)` — search +
  filter + cursor-paginated list, returns `{ items, nextCursor, hasMore }`

**Mutations**
- `createCollection(input: { name, slug })`
- `createDocument(input: { title, content, collectionId, tags })`
- `updateDocument(id, input: { title?, content?, tags?, isArchived? })` —
  partial update, only provided fields change
- `deleteDocument(id)` → `Boolean`
- `moveDocument(id, collectionId)`

### Example

```graphql
mutation {
  createCollection(input: { name: "Invoices", slug: "invoices" }) {
    id
    slug
  }
}

query {
  documents(search: "revenue", isArchived: false, take: 10) {
    items { id title collectionId }
    nextCursor
    hasMore
  }
}
```

## Validation and error handling

Requests that fail validation return real GraphQL errors (with an
`extensions.code` of `BAD_USER_INPUT`, `NOT_FOUND`, or `CONFLICT`) — never
an unhandled 500:

- **Empty title / content** → `BAD_USER_INPUT` (whitespace-only counts as
  empty)
- **Malformed slug** → `BAD_USER_INPUT`. A slug must be lowercase
  kebab-case: `^[a-z0-9]+(-[a-z0-9]+)*$` (e.g. `quarterly-reports-2026`).
  The assignment didn't pin an exact format, so this is a deliberate,
  documented choice rather than an implicit assumption — happy to adjust
  the pattern if a different convention is expected.
- **Duplicate slug** → `CONFLICT`. Slugs are enforced unique at the DB
  level (`@unique` in the schema) and checked explicitly in the resolver
  first so the error is clean rather than a raw Postgres constraint
  violation leaking through.
- **Referencing a collection that doesn't exist** (`createDocument`,
  `moveDocument`) → `NOT_FOUND`
- **Updating/deleting/moving a document that doesn't exist** → `NOT_FOUND`

See `src/lib/errors.ts` and `src/lib/validation.ts`.

## Design decisions & tradeoffs

A few places where the assignment left room for judgment calls — noted
here rather than left implicit:

- **Cascade delete on `Collection → Document`.** Deleting a collection
  deletes its documents (`onDelete: Cascade`). The alternative is
  `Restrict` (block the delete until documents are moved/removed first),
  which is arguably safer for a real product but adds a mutation-level
  precondition the assignment didn't ask for. I went with cascade for
  simplicity within scope; flipping it is a one-line schema change plus a
  migration.
- **Slug uniqueness.** Not explicitly required, but two collections with
  the same slug is exactly the kind of bug that's cheap to prevent up
  front and expensive to clean up later, so I added a unique constraint.
- **Cursor pagination ordering.** Ordered by `(createdAt desc, id desc)`,
  not `createdAt` alone — `createdAt` alone isn't guaranteed unique
  (multiple documents can be created in the same millisecond in tests or
  bulk imports), which can cause a cursor-based page to skip or repeat
  rows. Adding `id` as a tiebreaker gives a total order.
- **`updateDocument` treats `null` and omitted the same way** for each
  input field — i.e. there's no way to explicitly "clear" `title` to
  empty via this mutation, because an empty title is rejected by
  validation anyway. `tags: []` is a valid explicit clear, though, since
  an empty tag list is meaningful.
- **Search is substring match via `ILIKE`, not full-text search.** The
  assignment asks for substring match specifically, so that's what's
  implemented (`contains`, `mode: insensitive`). See "Extending this"
  below for what full-text search would look like if that's ever needed.
- **Prisma pinned to 6.19.3, not the newer Prisma 7 line.** Prisma 7
  (released after this project started) changes how datasource URLs and
  the client are configured (moves to `prisma.config.ts`, requires a
  driver adapter). 6.19.3 is the latest release before that change and
  matches the API almost all current Prisma documentation and tooling
  assumes — the safer choice for a project meant to be picked up and run
  by someone else without extra setup friction.

## What's explicitly out of scope

Per the assignment: no authentication, no RBAC/permissions, no GraphQL
Federation, no Redis/caching layer, no deployment config beyond the local
Dockerfile below.

## Extending this design

- **Full-text / fuzzy search.** Swap the `contains` filter for Postgres's
  `pg_trgm` extension (trigram similarity) with a `GIN` index on `title`
  and `content`, or `tsvector`/`tsquery` for proper full-text ranking, if
  substring match on a large corpus becomes a performance problem —
  `ILIKE '%term%'` can't use a standard B-tree index and will degrade on
  large tables.
- **Authorization.** Add a `userId` (or `ownerId`) column on `Collection`,
  populate it from an auth context, and scope every query/mutation by it.
  The resolver layer is already structured so this would mean adding one
  `where` clause per query rather than restructuring anything.
- **Soft delete for documents**, if "delete" ever needs to be
  recoverable — add a `deletedAt` timestamp instead of a hard delete, and
  filter it out of normal queries by default.
- **Bulk operations** (archive multiple documents, batch move) — would sit
  naturally as new mutations reusing the existing validation helpers.
- **Rate limiting / query complexity limits** — worth adding before this
  is exposed publicly, since `documents(search: "a")` with no other
  filters is a full-table scan by design.

## Bonus items included

- `bun run sanity` — lint + typecheck + test in one command
- `Dockerfile` — containerizes the service itself
- `.github/workflows/ci.yml` — runs lint, typecheck, and tests (with a
  real Postgres service container) on every pull request

## AI use disclosure

Built with AI assistance (Claude). I reviewed and understand every part of
the implementation — happy to walk through any specific decision, resolver,
or tradeoff in more depth.
