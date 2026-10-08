import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Enrollment, Semester } = db;

export const dropEnrollment = async (id) => {
  const enrollment = await Enrollment.findByPk(id, {
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
    throw new AppError(
      "Enrollment is already dropped",
      409
    );
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