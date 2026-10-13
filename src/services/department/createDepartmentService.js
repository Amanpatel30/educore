import { Op } from "sequelize";
import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Department } = db;

export const createDepartment = async (data) => {
  const name =
    typeof data.name === "string" ? data.name.trim() : "";
  const code =  
    typeof data.code === "string" ? data.code.trim() : "";

  if (!name || !code) {
    throw new AppError("name and code are required", 400);
  }

  const existing = await Department.findOne({
    where: { [Op.or]: [{ name }, { code }] },
  });

  if (existing) {
    throw new AppError(
      existing.name === name
        ? "Department name already exists"
        : "Department code already exists",
      409
    );
  }

  return Department.create({
    name,
    code,
    description: data.description ?? null,
  });
};
