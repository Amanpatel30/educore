import db from "../../../models/index.js";

const { Semester } = db;

export const getSemesters = async (pagination = null) => {
  const { rows, count } = await Semester.findAndCountAll({
    order: [
      ["startDate", "DESC"],
    ],
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
    }),
  });

  return { rows, total: count };
};
