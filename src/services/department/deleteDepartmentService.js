import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Department, Course, Student, Instructor } = db;

export const deleteDepartment = async (id) => {
  const department = await Department.findByPk(id);

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  const [courses, students, instructors] = await Promise.all([
    Course.count({ where: { departmentId: id } }),
    Student.count({ where: { departmentId: id } }),
    Instructor.count({ where: { departmentId: id } }),
  ]);

  if (courses + students + instructors > 0) {
    throw new AppError(
      "Cannot delete a department that still has courses, students or instructors. Deactivate it instead.",
      409
    );
  }

  await department.destroy();
};
