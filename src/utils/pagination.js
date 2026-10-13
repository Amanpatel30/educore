const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/*
 * Returns null when the caller sent neither ?page nor ?limit, which keeps the
 * unpaginated response shape that existing clients already depend on.
 */
export const getPagination = (query) => {
  if (query.page === undefined && query.limit === undefined) {
    return null;
  }

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );

  return { page, limit, offset: (page - 1) * limit };
};
