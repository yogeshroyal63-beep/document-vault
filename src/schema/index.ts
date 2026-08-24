import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema } from "graphql-yoga";
import { resolvers } from "../resolvers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(join(__dirname, "schema.graphql"), "utf-8");

// createSchema is graphql-yoga's re-export of @graphql-tools/schema's
// makeExecutableSchema — kept as a single call so this file is the one
// place that wires the SDL file to the resolver map (schema-first, as
// required by the assignment).
export const schema = createSchema({
  typeDefs,
  resolvers,
});
