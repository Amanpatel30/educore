import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Course, Department, sequelize } = db;

export const createCourse = async (data, actorId = null) => {
  const { departmentId, code, name, credits, capacity } = data;

  if (!departmentId || !code || !name || !credits) {
    throw new AppError(
      "departmentId, code, name and credits are required",
      400
    );
  }

  return sequelize.transaction(async (transaction) => {
    const department = await Department.findByPk(departmentId, { transaction });

    if (!department) {
      throw new AppError("Department not found", 404);
    }

    const existingCourse = await Course.findOne({
      where: { code },
      transaction,
    });

    if (existingCourse) {
      throw new AppError("Course code already exists", 409);
    }

    const course = await Course.create(
      {
        departmentId,
        code,
        name,
        credits,
        capacity,
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "CREATE_COURSE",
          targetType: "Course",
          targetId: course.id,
        },
        transaction
      );
    }

    return course;
  });
};