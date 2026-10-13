import db from "../../../models/index.js";

const { AdminOperation, User } = db;

export const getAuditLogs = async ({ pagination, operation }) => {
  const where = {};

  if (operation) {
    where.operation = operation;
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
