import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { CourseInstructor } = db;

export const removeCourseAssignment = async (
  courseId,
  instructorId
) => {
  const assignment = await CourseInstructor.findOne({
    where: {
      courseId,
      instructorId,
    },
  });

  if (!assignment) {
    throw new AppError("Course assignment not found", 404);
  }

  await assignment.destroy();
};