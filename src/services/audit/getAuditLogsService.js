import { Op } from "sequelize";
import db from "../../../models/index.js";

const { AdminOperation, User } = db;

export const getAuditLogs = async ({ pagination, operation, search }) => {
  const where = {};
  const conditions = [];

  if (operation) {
    if (operation === "CREATE") {
      conditions.push({
        [Op.or]: [
          { operation: "CREATE" },
          { operation: { [Op.like]: "CREATE_%" } },
        ],
      });
    } else if (operation === "UPDATE") {
      conditions.push({
        [Op.or]: [
          { operation: "UPDATE" },
          { operation: { [Op.like]: "UPDATE_%" } },
        ],
      });
    } else if (operation === "DELETE") {
      conditions.push({
        [Op.or]: [
          { operation: "DELETE" },
          { operation: { [Op.like]: "DELETE_%" } },
          { operation: { [Op.like]: "DROP_%" } },
          { operation: { [Op.like]: "REMOVE_%" } },
        ],
      });
    } else {
      conditions.push({ operation });
    }
  }

  if (search) {
    const isNum = /^\d+$/.test(search);
    conditions.push({
      [Op.or]: [
        { operation: { [Op.iLike]: `%${search}%` } },
        { targetType: { [Op.iLike]: `%${search}%` } },
        ...(isNum ? [{ targetId: Number(search) }] : []),
        { "$admin.name$": { [Op.iLike]: `%${search}%` } },
        { "$admin.email$": { [Op.iLike]: `%${search}%` } },
      ],
    });
  }

  if (conditions.length > 0) {
    where[Op.and] = conditions;
  }

  const { rows, count } = await AdminOperation.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "admin",
        attributes: ["id", "name", "email"],
      },
    ],
    order: [["createdAt", "DESC"]],
    distinct: true,
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
    }),
  });

  return { rows, total: count };
};
