import { Op } from "sequelize";
import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Department } = db;

export const updateDepartment = async (id, data) => {
  const department = await Department.findByPk(id);

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const changes = {};

  if (data.name !== undefined) {
    changes.name = String(data.name).trim();
  }

  if (data.code !== undefined) {
    changes.code = String(data.code).trim();
  }

  if (data.description !== undefined) {
    changes.description = data.description;
  }

  if (data.isActive !== undefined) {
    if (typeof data.isActive !== "boolean") {
      throw new AppError("isActive must be a boolean", 400);
    }

    changes.isActive = data.isActive;
  }

  if (changes.name === "" || changes.code === "") {
    throw new AppError("name and code cannot be empty", 400);
  }

  if (changes.name || changes.code) {
    const duplicate = await Department.findOne({
      where: {
        id: { [Op.ne]: id },
        [Op.or]: [
          ...(changes.name ? [{ name: changes.name }] : []),
          ...(changes.code ? [{ code: changes.code }] : []),
        ],
      },
    });

    if (duplicate) {
      throw new AppError(
        duplicate.name === changes.name
          ? "Department name already exists"
          : "Department code already exists",
        409
      );
    }
  }

  await department.update(changes);

  return department;
};
