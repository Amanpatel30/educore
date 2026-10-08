import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const {
  Enrollment,
  Student,
  User,
  Course,
  Department,
  Semester,
} = db;

export const getEnrollmentById = async (id) => {
  const enrollment = await Enrollment.findByPk(id, {
    include: [
      {
        model: Student,
        as: "student",
        attributes: ["id", "studentCode", "status"],

        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "email"],
          },
        ],
      },

      {
        model: Course,
        as: "course",
        attributes: ["id", "code", "name", "credits"],

        include: [
          {
            model: Department,
            as: "department",
            attributes: ["id", "name", "code"],
          },
        ],
      },

      {
        model: Semester,
        as: "semester",
        attributes: [
          "id",
          "name",
          "academicYear",
          "startDate",
          "endDate",
          "status",
        ],
      },
    ],
  });

  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  return enrollment;
};