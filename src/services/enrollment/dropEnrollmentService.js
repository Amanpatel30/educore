import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Enrollment, Semester, sequelize } = db;

export const dropEnrollment = async (id, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const enrollment = await Enrollment.findByPk(id, {
      include: [
        {
          model: Semester,
          as: "semester",
        },
      ],
      transaction,
    });

    if (!enrollment) {
      throw new AppError("Enrollment not found", 404);
    }

    if (enrollment.status === "DROPPED") {
      throw new AppError(
        "Enrollment is already dropped",
        409
      );
    }

    if (enrollment.semester.status !== "OPEN") {
      throw new AppError(
        "Enrollment cannot be dropped after the semester is closed",
        400
      );
    }

    await enrollment.update(
      {
        status: "DROPPED",
        droppedAt: new Date(),
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "DROP_ENROLLMENT",
          targetType: "Enrollment",
          targetId: enrollment.id,
        },
        transaction
      );
    }

    return enrollment;
  });
};