import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Course, sequelize } = db;

export const deleteCourse = async (id, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const course = await Course.findByPk(id, { transaction });

    if (!course) {
      throw new AppError("Course not found", 404);
    }

    await course.update(
      {
        isActive: false,
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "DELETE_COURSE",
          targetType: "Course",
          targetId: course.id,
        },
        transaction
      );
    }

    return course;
  });
};