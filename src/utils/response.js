export const ok = (res, data, message = null) => {
  return res.status(200).json({
    ...(message && { message }),
    ...data,
  });
};

export const created = (res, data, message = null) => {
  return res.status(201).json({
    ...(message && { message }),
    ...data,
  });
};

export const noContent = (res) => {
  return res.status(204).send();
};

/*
 * List response. Without a `pagination` argument the body is unchanged from
 * the pre-pagination contract: count is the number of rows returned and no
 * page metadata is added.
 */
export const okList = (res, key, { rows, total }, pagination = null) => {
  return ok(res, {
    count: rows.length,
    ...(pagination && {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    }),
    [key]: rows,
  });
};
