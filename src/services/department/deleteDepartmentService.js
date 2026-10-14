import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Department, Course, Student, Instructor, sequelize } = db;

export const deleteDepartment = async (id, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const department = await Department.findByPk(id, { transaction });

    if (!department) {
      throw new AppError("Department not found", 404);
    }

    const [courses, students, instructors] = await Promise.all([
      Course.count({ where: { departmentId: id }, transaction }),
      Student.count({ where: { departmentId: id }, transaction }),
      Instructor.count({ where: { departmentId: id }, transaction }),
    ]);

    if (courses + students + instructors > 0) {
      throw new AppError(
        "Cannot delete a department that still has courses, students or instructors. Deactivate it instead.",
        409
      );
    }

    await department.destroy({ transaction });

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "DELETE_DEPARTMENT",
          targetType: "Department",
          targetId: id,
        },
        transaction
      );
    }
  });
};
