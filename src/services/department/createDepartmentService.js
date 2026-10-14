import { Op } from "sequelize";
import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Department, sequelize } = db;

export const createDepartment = async (data, actorId = null) => {
  const name =
    typeof data.name === "string" ? data.name.trim() : "";
  const code =  
    typeof data.code === "string" ? data.code.trim() : "";

  if (!name || !code) {
    throw new AppError("name and code are required", 400);
  }

  return sequelize.transaction(async (transaction) => {
    const existing = await Department.findOne({
      where: { [Op.or]: [{ name }, { code }] },
      transaction,
    });

    if (existing) {
      throw new AppError(
        existing.name === name
          ? "Department name already exists"
          : "Department code already exists",
        409
      );
    }

    const department = await Department.create(
      {
        name,
        code,
        description: data.description ?? null,
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "CREATE_DEPARTMENT",
          targetType: "Department",
          targetId: department.id,
        },
        transaction
      );
    }

    return department;
  });
};
