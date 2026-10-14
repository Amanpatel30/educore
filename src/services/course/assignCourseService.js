import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Course, Instructor, CourseInstructor, sequelize } = db;

export const assignCourse = async (courseId, instructorId, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const course = await Course.findByPk(courseId, { transaction });

    if (!course) {
      throw new AppError("Course not found", 404);
    }

    if (!course.isActive) {
      throw new AppError("Cannot assign an inactive course", 400);
    }

    const instructor = await Instructor.findByPk(instructorId, {
      transaction,
    });

    if (!instructor) {
      throw new AppError("Instructor not found", 404);
    }

    if (instructor.status !== "ACTIVE") {
      throw new AppError("Instructor is not active", 400);
    }

    const existingAssignment = await CourseInstructor.findOne({
      where: {
        courseId,
        instructorId,
      },
      transaction,
    });

    if (existingAssignment) {
      throw new AppError("Course is already assigned to this instructor", 409);
    }

    const assignment = await CourseInstructor.create(
      {
        courseId,
        instructorId,
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "ASSIGN_COURSE_INSTRUCTOR",
          targetType: "Course",
          targetId: courseId,
        },
        transaction
      );
    }

    return assignment;
  });
};