import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Semester, sequelize } = db;

export const openSemester = async (id, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const semester = await Semester.findByPk(id, { transaction });

    if (!semester) {
      throw new AppError("Semester not found", 404);
    }

    if (semester.status === "OPEN") {
      throw new AppError("Semester is already open", 409);
    }

    if (semester.status === "CLOSED") {
      throw new AppError(
        "A closed semester cannot be reopened",
        409
      );
    }

    await semester.update(
      {
        status: "OPEN",
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "OPEN_SEMESTER",
          targetType: "Semester",
          targetId: semester.id,
        },
        transaction
      );
    }

    return semester;
  });
};