


import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const {
  Enrollment,
  Student,
  Course,
  Semester,
} = db;

export const getMyEnrollmentById = async (
  userId,
  enrollmentId
) => {
  const student = await Student.findOne({
    where: {
      userId,
    },
  });

  if (!student) {
    throw new AppError("Student profile not found", 404);
  }

  const enrollment = await Enrollment.findOne({
    where: {
      id: enrollmentId,
      studentId: student.id,
    },

    include: [
      {
        model: Course,
        as: "course",
        attributes: ["id", "code", "name", "credits"],
      },

      {
        model: Semester,
        as: "semester",
        attributes: [
          "id",
          "name",
          "academicYear",
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
