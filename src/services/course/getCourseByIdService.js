import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Department } = db;

export const getCourseById = async (id) => {
  const course = await Course.findByPk(id, {
    include: [
      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
      },
    ],
  });

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  return course;
};