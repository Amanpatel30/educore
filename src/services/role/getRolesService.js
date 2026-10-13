import db from "../../../models/index.js";

const { Role, Permission } = db;

export const getRoles = async () => {
  const roles = await Role.findAll({
    attributes: ["id", "name"],
    include: [
      {
        model: Permission,
        as: "permissions",
        attributes: ["id", "name"],
        through: { attributes: [] },
      },
    ],
    order: [["name", "ASC"]],
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    permissions: role.permissions
      .map((permission) => permission.name)
      .sort(),
  }));
};
