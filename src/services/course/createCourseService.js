import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Department } = db;

export const createCourse = async (data) => {
  const { departmentId, code, name, credits, capacity } = data;

  if (!departmentId || !code || !name || !credits) {
    throw new AppError(
      "departmentId, code, name and credits are required",
      400
    );
  }

  const department = await Department.findByPk(departmentId);

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const existingCourse = await Course.findOne({
    where: { code },
  });

  if (existingCourse) {
    throw new AppError("Course code already exists", 409);
  }

  return Course.create({
    departmentId,
    code,
    name,
    credits,
    capacity,
  });
};