import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Department } = db;

export const getDepartmentById = async (id) => {
  const department = await Department.findByPk(id);

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  return department;
};
