import { AppError } from "./AppError.js";

/*
 * Query parameters arrive as strings. A value outside the documented set is
 * rejected rather than coerced, so a typo cannot silently change the filter.
 */
export const parseBooleanQuery = (value, label) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new AppError(`${label} must be "true" or "false"`, 400);
};

/*
 * Free-text search. Bounded so a single request cannot force an expensive
 * pattern match over the whole table.
 */
export const parseSearchQuery = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const term = value.trim();

  return term === "" ? undefined : term.slice(0, 100);
};

export const parseStringQuery = (value, { label, allowed }) => {
  if (value === undefined) {
    return undefined;
  }

  if (!allowed.includes(value)) {
    throw new AppError(
      `${label} must be one of: ${allowed.join(", ")}`,
      400
    );
  }

  return value;
};

/*
 * An id in the query string is still an id: a non-numeric value would reach
 * PostgreSQL as a failed cast.
 */
export const parseIdQuery = (value, label) => {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new AppError(`${label} must be a positive integer`, 400);
  }

  return value;
};
