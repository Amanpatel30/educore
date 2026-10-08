import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Department } = db;

export const updateCourse = async (id, data) => {
  const course = await Course.findByPk(id);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  const {
    departmentId,
    code,
    name,
    credits,
    capacity,
    isActive,
  } = data;

  if (departmentId) {
    const department = await Department.findByPk(departmentId);

    if (!department) {
      throw new AppError("Department not found", 404);
    }
  }

  if (code && code !== course.code) {
    const existingCourse = await Course.findOne({
      where: { code },
    });

    if (existingCourse) {
      throw new AppError("Course code already exists", 409);
    }
  }

  await course.update({
    ...(departmentId !== undefined && { departmentId }),
    ...(code !== undefined && { code }),
    ...(name !== undefined && { name }),
    ...(credits !== undefined && { credits }),
    ...(capacity !== undefined && { capacity }),
    ...(isActive !== undefined && { isActive }),
  });

  return course;
};