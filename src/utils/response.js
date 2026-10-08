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