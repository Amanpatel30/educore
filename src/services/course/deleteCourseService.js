import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course } = db;

export const deleteCourse = async (id) => {
  const course = await Course.findByPk(id);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  await course.update({
    isActive: false,
  });

  return course;
};