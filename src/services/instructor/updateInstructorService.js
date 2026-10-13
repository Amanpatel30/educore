import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { requireOneOf, requireText } from "../../utils/validate.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Instructor, Department, sequelize } = db;

const STATUSES = ["ACTIVE", "INACTIVE"];

/*
 * Profile fields only. The account, its email and its role are managed through
 * /api/users; this endpoint cannot change who the person is, only where they
 * sit and whether they are active.
 */
export const updateInstructor = async ({ actorId, instructorId, body }) => {
  return sequelize.transaction(async (transaction) => {
    const instructor = await Instructor.findByPk(instructorId, {
      transaction,
    });

    if (!instructor) {
      throw new AppError("Instructor not found", 404);
    }

    const changes = {};

    if (body.departmentId !== undefined) {
      const departmentId = requireText(
        String(body.departmentId),
        "departmentId"
      );

      if (!/^\d+$/.test(departmentId)) {
        throw new AppError("departmentId must be a positive integer", 400);
      }

      const department = await Department.findByPk(departmentId, {
        transaction,
      });

      if (!department) {
        throw new AppError("Department not found", 404);
      }

      changes.departmentId = departmentId;
    }

    if (body.designation !== undefined) {
      changes.designation = requireText(body.designation, "designation");
    }

    if (body.status !== undefined) {
      changes.status = requireOneOf(body.status, "status", STATUSES);
    }

    if (Object.keys(changes).length === 0) {
      throw new AppError("No supported fields to update", 400);
    }

    await instructor.update(changes, { transaction });

    await recordAdminOperation(
      {
        adminUserId: actorId,
        operation: "UPDATE_INSTRUCTOR",
        targetType: "Instructor",
        targetId: instructor.id,
      },
      transaction
    );

    return instructor;
  });
};
