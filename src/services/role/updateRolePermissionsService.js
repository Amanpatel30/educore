import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";
import { loadActor } from "../user/userAdminRules.js";

const { Role, Permission, RolePermission, sequelize } = db;

/*
 * The permission names granted to a role. The caller's own set is the ceiling
 * on what it may grant.
 */
const permissionsOf = async (roleId, transaction) => {
  const role = await Role.findByPk(roleId, {
    include: [
      {
        model: Permission,
        as: "permissions",
        attributes: ["name"],
        through: { attributes: [] },
      },
    ],
    transaction,
  });

  return new Set(
    (role?.permissions || []).map((permission) => permission.name)
  );
};

/*
 * Replaces the whole grant set for one role. Approved 2026-10-12: tiered
 * management with anti-escalation. Two rules protect the caller's authority —
 * changing your own role's grants would be self-promotion, and you cannot hand
 * out a permission you do not hold.
 */
export const updateRolePermissions = async ({
  actorId,
  roleId,
  permissions,
}) => {
  if (
    !Array.isArray(permissions) ||
    permissions.some((name) => typeof name !== "string")
  ) {
    throw new AppError(
      "permissions must be an array of permission names",
      400
    );
  }

  const requested = [...new Set(permissions)];

  return sequelize.transaction(async (transaction) => {
    const actor = await loadActor(actorId, transaction);

    const role = await Role.findByPk(roleId, { transaction });

    if (!role) {
      throw new AppError("Role not found", 404);
    }

    if (String(role.id) === String(actor.roleId)) {
      throw new AppError(
        "You cannot change the permissions of your own role",
        403
      );
    }

    const actorPermissions = await permissionsOf(actor.roleId, transaction);

    const known = new Set(
      (
        await Permission.findAll({ attributes: ["name"], transaction })
      ).map((permission) => permission.name)
    );

    for (const name of requested) {
      if (!known.has(name)) {
        throw new AppError(`Unknown permission: ${name}`, 400);
      }

      if (!actorPermissions.has(name)) {
        throw new AppError(
          `You cannot grant a permission you do not hold: ${name}`,
          403
        );
      }
    }

    await RolePermission.destroy({
      where: { roleId: role.id },
      transaction,
    });

    if (requested.length > 0) {
      const rows = await Permission.findAll({
        where: { name: requested },
        attributes: ["id"],
        transaction,
      });

      await RolePermission.bulkCreate(
        rows.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        { transaction }
      );
    }

    await recordAdminOperation(
      {
        adminUserId: actor.id,
        operation: "UPDATE_ROLE_PERMISSIONS",
        targetType: "Role",
        targetId: role.id,
      },
      transaction
    );

    return { id: role.id, name: role.name, permissions: requested.sort() };
  });
};
