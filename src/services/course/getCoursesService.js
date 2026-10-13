import { Op } from "sequelize";

import db from "../../../models/index.js";

const { Course, Department } = db;

/*
 * isActive is passed in rather than fixed: the catalog defaults to active
 * courses, and only a caller holding COURSE_CREATE_UPDATE may ask for the
 * inactive ones or for all of them.
 */
export const getCourses = async (
  pagination = null,
  { search, departmentId, isActive, sort = "code", order = "ASC" } = {}
) => {
  const where = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (search) {
    where[Op.or] = [
      { code: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Course.findAndCountAll({
    where,
    include: [
      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
      },
    ],
    order: [[sort, order]],
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};
