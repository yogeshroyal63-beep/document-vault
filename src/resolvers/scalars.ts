import { GraphQLScalarType, Kind } from "graphql";
import { ValidationError } from "../lib/errors.js";

/**
 * Minimal DateTime scalar. This API never accepts a DateTime as an input
 * argument (createdAt is always server-generated), so parseValue/parseLiteral
 * exist only for completeness / future-proofing rather than being exercised
 * today.
 */
export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 date-time string",
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new ValidationError("DateTime scalar can only serialize Date objects");
  },
  parseValue(value: unknown): Date {
    if (typeof value !== "string") {
      throw new ValidationError("DateTime scalar expects a string");
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError(`"${value}" is not a valid ISO-8601 date-time`);
    }
    return date;
  },
  parseLiteral(ast): Date {
    if (ast.kind !== Kind.STRING) {
      throw new ValidationError("DateTime scalar expects a string literal");
    }
    const date = new Date(ast.value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError(`"${ast.value}" is not a valid ISO-8601 date-time`);
    }
    return date;
  },
});
