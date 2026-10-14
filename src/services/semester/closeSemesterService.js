import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Semester, sequelize } = db;

export const closeSemester = async (id, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const semester = await Semester.findByPk(id, { transaction });

    if (!semester) {
      throw new AppError("Semester not found", 404);
    }

    if (semester.status === "CLOSED") {
      throw new AppError("Semester is already closed", 409);
    }

    if (semester.status === "UPCOMING") {
      throw new AppError(
        "An upcoming semester cannot be closed",
        409
      );
    }

    await semester.update(
      {
        status: "CLOSED",
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "CLOSE_SEMESTER",
          targetType: "Semester",
          targetId: semester.id,
        },
        transaction
      );
    }

    return semester;
  });
};