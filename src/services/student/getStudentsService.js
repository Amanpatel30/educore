import { Op } from "sequelize";

import db from "../../../models/index.js";

const { Student, User, Department } = db;

export const getStudents = async ({
  pagination,
  departmentId,
  status,
  search,
}) => {
  const where = {};

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where[Op.or] = [
      { studentCode: { [Op.iLike]: `%${search}%` } },
      { "$user.name$": { [Op.iLike]: `%${search}%` } },
      { "$user.email$": { [Op.iLike]: `%${search}%` } },
    ];
  }

  /*
   * subQuery: false keeps the joined user columns addressable by the search
   * filter when a limit is applied. Both includes are belongsTo, so the join
   * cannot multiply rows and the offset stays correct.
   */
  const { rows, count } = await Student.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email", "status"],
      },
      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
      },
    ],
    order: [["studentCode", "ASC"]],
    subQuery: false,
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};
