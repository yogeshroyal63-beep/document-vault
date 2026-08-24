import { createYoga } from "graphql-yoga";
import { schema } from "./schema/index.js";
import { createContext } from "./context.js";

const port = Number(process.env.PORT ?? 4000);

const yoga = createYoga({
  schema,
  context: createContext,
  graphqlEndpoint: "/graphql",
});

Bun.serve({
  port,
  fetch: (request) => yoga.fetch(request),
});

// eslint-disable-next-line no-console
console.log(`🔒 Document Vault GraphQL API ready at http://localhost:${port}/graphql`);
