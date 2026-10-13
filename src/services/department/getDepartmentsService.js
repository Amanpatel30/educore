import { Op } from "sequelize";
import db from "../../../models/index.js";

const { Department } = db;

export const getDepartments = async ({
  pagination,
  isActive,
  search,
}) => {
  const where = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { code: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Department.findAndCountAll({
    where,
    order: [["name", "ASC"]],
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};
