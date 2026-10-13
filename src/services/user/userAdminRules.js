import { Op } from "sequelize";

import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { User, Role } = db;

/*
 * Approved 2026-10-12: tiered account management with anti-escalation.
 *
 * A caller may only reach roles below its own, plus peers where that is safe.
 * Nobody may create another SUPER_ADMIN, and the last active SUPER_ADMIN can
 * never be demoted or disabled — both are lockout guards, not policy.
 */
const ASSIGNABLE_ROLES = {
  SUPER_ADMIN: ["ADMIN", "INSTRUCTOR", "STUDENT"],
  ADMIN: ["STUDENT", "INSTRUCTOR"],
};

const MANAGEABLE_ROLES = {
  SUPER_ADMIN: ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "STUDENT"],
  ADMIN: ["STUDENT", "INSTRUCTOR"],
};

export const loadActor = async (actorId, transaction) => {
  const actor = await User.findByPk(actorId, {
    attributes: ["id", "name", "email", "roleId", "status"],
    include: [
      { model: Role, as: "roleDetails", attributes: ["id", "name"] },
    ],
    transaction,
  });

  /*
   * The token was valid, so the row existed when the request started. It can
   * still disappear mid-request, and then there is no one to attribute the
   * change to.
   */
  if (!actor || !actor.roleDetails) {
    throw new AppError("Acting user no longer exists", 401);
  }

  return {
    id: actor.id,
    roleId: actor.roleId,
    roleName: actor.roleDetails.name,
  };
};

export const assertRoleAssignable = (actorRole, roleName) => {
  if (!(ASSIGNABLE_ROLES[actorRole] || []).includes(roleName)) {
    throw new AppError(
      `You cannot create or assign the role ${roleName}`,
      403
    );
  }
};

export const assertRoleManageable = (actorRole, targetRole) => {
  if (!(MANAGEABLE_ROLES[actorRole] || []).includes(targetRole)) {
    throw new AppError(`You cannot manage ${targetRole} accounts`, 403);
  }
};

/*
 * Lockout guard. Called before any change that would leave the system with no
 * active SUPER_ADMIN.
 */
export const assertNotLastSuperAdmin = async (
  { excludingUserId, transaction }
) => {
  const role = await Role.findOne({
    where: { name: "SUPER_ADMIN" },
    transaction,
  });

  const remaining = await User.count({
    where: {
      roleId: role.id,
      status: "ACTIVE",
      ...(excludingUserId && { id: { [Op.ne]: excludingUserId } }),
    },
    transaction,
  });

  if (remaining === 0) {
    throw new AppError(
      "The last active SUPER_ADMIN cannot be demoted or disabled",
      409
    );
  }
};
