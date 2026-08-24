import {
  collectionFieldResolvers,
  collectionMutations,
  collectionQueries,
} from "./collection.resolvers.js";
import {
  documentFieldResolvers,
  documentMutations,
  documentQueries,
} from "./document.resolvers.js";
import { DateTimeScalar } from "./scalars.js";

export const resolvers = {
  DateTime: DateTimeScalar,
  Query: {
    ...collectionQueries,
    ...documentQueries,
  },
  Mutation: {
    ...collectionMutations,
    ...documentMutations,
  },
  Collection: collectionFieldResolvers,
  Document: documentFieldResolvers,
};
