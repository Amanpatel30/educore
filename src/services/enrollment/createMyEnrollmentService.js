import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { createEnrollment } from "./createEnrollmentService.js";

const { Student } = db;

export const createMyEnrollment = async (userId, data) => {
  const student = await Student.findOne({
    where: {
      userId,
    },
  });

  if (!student) {
    throw new AppError("Student profile not found", 404);
  }

  return createEnrollment({
    studentId: student.id,
    courseId: data.courseId,
    semesterId: data.semesterId,
  });
};