import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Course, Department, sequelize } = db;

export const updateCourse = async (id, data, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const course = await Course.findByPk(id, { transaction });

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
      const department = await Department.findByPk(departmentId, {
        transaction,
      });

      if (!department) {
        throw new AppError("Department not found", 404);
      }
    }

    if (code && code !== course.code) {
      const existingCourse = await Course.findOne({
        where: { code },
        transaction,
      });

      if (existingCourse) {
        throw new AppError("Course code already exists", 409);
      }
    }

    await course.update(
      {
        ...(departmentId !== undefined && { departmentId }),
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(credits !== undefined && { credits }),
        ...(capacity !== undefined && { capacity }),
        ...(isActive !== undefined && { isActive }),
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "UPDATE_COURSE",
          targetType: "Course",
          targetId: course.id,
        },
        transaction
      );
    }

    return course;
  });
};