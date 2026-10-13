import { Op } from "sequelize";

import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { requireOneOf, requireText } from "../../utils/validate.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";
import {
  assertNotLastSuperAdmin,
  assertRoleAssignable,
  assertRoleManageable,
  loadActor,
} from "./userAdminRules.js";

const { User, Role, Student, Instructor, sequelize } = db;

const USER_STATUSES = ["ACTIVE", "INACTIVE"];

const findRole = async (name, transaction) => {
  const role = await Role.findOne({ where: { name }, transaction });

  if (!role) {
    throw new AppError(`Unknown role: ${name}`, 400);
  }

  return role;
};

/*
 * Moving a user to another role while they hold a profile would leave a Students
 * or Instructors row attached to a user who is no longer one. There is no
 * endpoint that removes a profile, so the change is refused rather than
 * leaving the data inconsistent.
 */
const profileCount = async (userId, transaction) => {
  const [students, instructors] = await Promise.all([
    Student.count({ where: { userId }, transaction }),
    Instructor.count({ where: { userId }, transaction }),
  ]);

  return students + instructors;
};

export const updateUser = async ({ actorId, targetId, body }) => {
  return sequelize.transaction(async (transaction) => {
    const actor = await loadActor(actorId, transaction);

    const target = await User.findByPk(targetId, {
      attributes: ["id", "name", "email", "roleId", "status"],
      include: [
        { model: Role, as: "roleDetails", attributes: ["id", "name"] },
      ],
      transaction,
    });

    if (!target) {
      throw new AppError("User not found", 404);
    }

    const currentRole = target.roleDetails.name;
    const isSelf = String(target.id) === String(actor.id);

    /*
     * Self-edits are exempt from the tier rule so that the specific refusals
     * below win: an ADMIN changing its own role would otherwise be stopped by
     * the role tier with a message that hides the real reason.
     */
    if (!isSelf) {
      assertRoleManageable(actor.roleName, currentRole);
    }

    const changes = {};
    let nextRole = currentRole;

    if (body.name !== undefined) {
      changes.name = requireText(body.name, "name");
    }

    if (body.email !== undefined) {
      const email = requireText(body.email, "email");

      const taken = await User.count({
        where: { email, id: { [Op.ne]: target.id } },
        transaction,
      });

      if (taken > 0) {
        throw new AppError("Email is already registered", 409);
      }

      changes.email = email;
    }

    if (body.role !== undefined) {
      const roleName = requireText(body.role, "role");

      if (roleName !== currentRole) {
        /*
         * Self-promotion is the escalation this rule exists to stop. It also
         * covers self-demotion, which is the same lockout risk from the other
         * direction.
         */
        if (isSelf) {
          throw new AppError("You cannot change your own role", 403);
        }

        assertRoleAssignable(actor.roleName, roleName);

        if ((await profileCount(target.id, transaction)) > 0) {
          throw new AppError(
            "This user has a student or instructor profile. Remove the profile before changing their role.",
            409
          );
        }

        if (currentRole === "SUPER_ADMIN" && target.status === "ACTIVE") {
          await assertNotLastSuperAdmin({
            excludingUserId: target.id,
            transaction,
          });
        }

        changes.roleId = (await findRole(roleName, transaction)).id;
        nextRole = roleName;
      }
    }

    if (body.status !== undefined) {
      const status = requireOneOf(body.status, "status", USER_STATUSES);

      if (status !== target.status) {
        if (isSelf) {
          throw new AppError("You cannot change your own status", 403);
        }

        if (
          status === "INACTIVE" &&
          currentRole === "SUPER_ADMIN" &&
          target.status === "ACTIVE"
        ) {
          await assertNotLastSuperAdmin({
            excludingUserId: target.id,
            transaction,
          });
        }

        changes.status = status;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new AppError("No supported fields to update", 400);
    }

    await target.update(changes, { transaction });

    await recordAdminOperation(
      {
        adminUserId: actor.id,
        operation: "UPDATE_USER",
        targetType: "User",
        targetId: target.id,
      },
      transaction
    );

    return {
      id: target.id,
      name: target.name,
      email: target.email,
      roleId: target.roleId,
      role: nextRole,
      status: target.status,
    };
  });
};
