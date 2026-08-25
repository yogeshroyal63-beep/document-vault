# Walkthrough

This is a written walkthrough of the implementation and key decisions,
covering the same material I would present in a 5–10 minute implementation
walkthrough.

## What it does

Document Vault is a small GraphQL backend API for organizing documents into
collections.

The API supports:

- Creating and querying collections
- Creating, updating, deleting, and moving documents
- Fetching a single collection with its nested documents
- Searching documents by substring match on title or content
- Filtering documents by collection or archived state
- Cursor-based pagination using `take` and `cursor`
- Validation of titles, content, slugs, and pagination inputs
- Structured GraphQL errors for validation, conflicts, and missing records

The implementation intentionally stays within the assignment scope and does
not introduce authentication, RBAC, caching, federation, or deployment
infrastructure.

## Technology stack

- Bun
- TypeScript in strict mode
- GraphQL Yoga
- GraphQL SDL / schema-first design
- PostgreSQL
- Prisma ORM
- Docker Compose
- Bun test
- ESLint
- GitHub Actions

GraphQL Yoga is used as the HTTP GraphQL server, while the GraphQL schema is
defined separately using SDL and combined with the resolver map into an
executable schema.

## Project structure

```text
prisma/
  schema.prisma                 Data model and database indexes
  migrations/                   Generated Prisma migrations

src/
  schema/
    schema.graphql               GraphQL API contract
    index.ts                     Builds executable schema

  resolvers/
    collection.resolvers.ts      Collection queries and mutations
    document.resolvers.ts        Document queries and mutations
    scalars.ts                   DateTime scalar
    index.ts                     Root resolver map

  lib/
    errors.ts                    Typed GraphQL application errors
    validation.ts                Input validation helpers
    pagination.ts                Cursor pagination helper
    prisma.ts                    Prisma Client singleton

  context.ts                     GraphQL request context
  index.ts                        Server entrypoint

  __tests__/
    unit/
      fakePrisma.ts              In-memory Prisma test double
      validation.test.ts         Validation tests
      collection.resolvers.test.ts
      document.resolvers.test.ts

    integration/
      document-vault.integration.test.ts

docker/
  init-test-db.sql                Creates the separate integration-test DB

docker-compose.yml                PostgreSQL development/test environment
Dockerfile                        Service container image
.github/workflows/ci.yml          GitHub Actions CI
README.md                         Setup and API documentation
WALKTHROUGH.md                    This implementation walkthrough