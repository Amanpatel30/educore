import { Op } from "sequelize";

import db from "../../../models/index.js";
import { toPublicUser } from "./toPublicUser.js";

const { User, Role } = db;

export const getUsers = async ({ pagination, roleId, status, search }) => {
  const where = {};

  if (roleId) {
    where.roleId = roleId;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: ["id", "name", "email", "roleId", "status"],
    include: [
      { model: Role, as: "roleDetails", attributes: ["id", "name"] },
    ],
    order: [["name", "ASC"]],
    distinct: true,
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
    }),
  });

  return { rows: rows.map(toPublicUser), total: count };
};
