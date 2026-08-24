# Minimal multi-stage Dockerfile for the Document Vault API.
# Not required by the assignment (deployment is explicitly out of scope) —
# included as the "Dockerfile for the service itself" bonus item, for
# running the service in a container locally alongside docker-compose's
# Postgres, not as a production deployment artifact.

FROM oven/bun:1.1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]
