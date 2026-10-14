import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { CourseInstructor, sequelize } = db;

export const removeCourseAssignment = async (
  courseId,
  instructorId,
  actorId = null
) => {
  return sequelize.transaction(async (transaction) => {
    const assignment = await CourseInstructor.findOne({
      where: {
        courseId,
        instructorId,
      },
      transaction,
    });

    if (!assignment) {
      throw new AppError("Course assignment not found", 404);
    }

    await assignment.destroy({ transaction });

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "REMOVE_COURSE_INSTRUCTOR",
          targetType: "Course",
          targetId: courseId,
        },
        transaction
      );
    }
  });
};