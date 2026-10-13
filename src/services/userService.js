import db from "../../models/index.js";
import { AppError } from "../utils/AppError.js";

const { User, Role } = db;

export const getCurrentUser = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: ["id", "name", "email", "roleId", "status"],
    include: [
      {
        model: Role,
        as: "roleDetails",
        attributes: ["id", "name"],
      },
    ],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    role: user.roleDetails ? user.roleDetails.name : null,
    status: user.status,
  };
};
