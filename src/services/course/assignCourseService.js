import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Instructor, CourseInstructor } = db;

export const assignCourse = async (courseId, instructorId) => {
  const course = await Course.findByPk(courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (!course.isActive) {
    throw new AppError("Cannot assign an inactive course", 400);
  }

  const instructor = await Instructor.findByPk(instructorId);

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
  });

  if (existingAssignment) {
    throw new AppError("Course is already assigned to this instructor", 409);
  }

  return CourseInstructor.create({
    courseId,
    instructorId,
  });
};