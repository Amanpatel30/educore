import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { toPublicUser } from "./toPublicUser.js";

const { User, Role } = db;

export const getUserById = async (id) => {
  const user = await User.findByPk(id, {
    attributes: ["id", "name", "email", "roleId", "status"],
    include: [
      { model: Role, as: "roleDetails", attributes: ["id", "name"] },
    ],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return toPublicUser(user);
};
