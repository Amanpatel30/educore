import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Student, User, Department, Enrollment, Course, Semester } = db;

export const getStudentById = async (id) => {
  const student = await Student.findByPk(id, {
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email", "status"],
      },
      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
      },
      {
        model: Enrollment,
        as: "enrollments",
        attributes: ["id", "status", "enrollmentDate", "grade", "droppedAt"],
        include: [
          { model: Course, as: "course", attributes: ["id", "code", "name"] },
          {
            model: Semester,
            as: "semester",
            attributes: ["id", "name", "academicYear", "status"],
          },
        ],
      },
    ],
    order: [[{ model: Enrollment, as: "enrollments" }, "id", "DESC"]],
  });

  if (!student) {
    throw new AppError("Student not found", 404);
  }

  return student;
};
