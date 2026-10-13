import { Op } from "sequelize";
import db from "../../../models/index.js";

const { Semester } = db;

export const getSemesters = async (
  pagination = null,
  { search, status, sort = "startDate", order = "DESC" } = {}
) => {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { academicYear: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Semester.findAndCountAll({
    where,
    order: [[sort, order]],
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
    }),
  });

  return { rows, total: count };
};
