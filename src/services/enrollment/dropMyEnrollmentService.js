import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const {
  Enrollment,
  Student,
  Semester,
} = db;

export const dropMyEnrollment = async (userId, enrollmentId) => {
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
        model: Semester,
        as: "semester",
      },
    ],
  });

  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  if (enrollment.status === "DROPPED") {
    throw new AppError("Enrollment is already dropped", 409);
  }

  if (enrollment.semester.status !== "OPEN") {
    throw new AppError(
      "Enrollment cannot be dropped after the semester is closed",
      400
    );
  }

  await enrollment.update({
    status: "DROPPED",
    droppedAt: new Date(),
  });

  return enrollment;
};