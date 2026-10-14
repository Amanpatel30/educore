import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Semester, Enrollment, sequelize } = db;

export const deleteSemester = async (id, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const semester = await Semester.findByPk(id, { transaction });

    if (!semester) {
      throw new AppError("Semester not found", 404);
    }

    const enrollmentCount = await Enrollment.count({
      where: {
        semesterId: id,
      },
      transaction,
    });

    if (enrollmentCount > 0) {
      throw new AppError(
        "Cannot delete a semester that has enrollments",
        409
      );
    }

    await semester.destroy({ transaction });

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "DELETE_SEMESTER",
          targetType: "Semester",
          targetId: id,
        },
        transaction
      );
    }
  });
};