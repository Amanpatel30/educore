import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const {
  Enrollment,
  Student,
  Course,
  Semester,
} = db;

export const createEnrollment = async (data) => {
  const {
    studentId,
    courseId,
    semesterId,
    enrollmentDate,
  } = data;

  if (!studentId || !courseId || !semesterId) {
    throw new AppError(
      "studentId, courseId and semesterId are required",
      400
    );
  }

  const student = await Student.findByPk(studentId);

  if (!student) {
    throw new AppError("Student not found", 404);
  }

  if (student.status !== "ACTIVE") {
    throw new AppError("Student is not active", 400);
  }

  const course = await Course.findByPk(courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (!course.isActive) {
    throw new AppError("Course is not active", 400);
  }

  const semester = await Semester.findByPk(semesterId);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  if (semester.status !== "OPEN") {
    throw new AppError(
      "Enrollment is only allowed in an open semester",
      400
    );
  }

  const existingEnrollment = await Enrollment.findOne({
    where: {
      studentId,
      courseId,
      semesterId,
    },
  });

  if (existingEnrollment) {
    throw new AppError(
      "Student is already enrolled in this course for this semester",
      409
    );
  }

  const activeEnrollmentCount = await Enrollment.count({
    where: {
      courseId,
      semesterId,
      status: "ACTIVE",
    },
  });

  if (activeEnrollmentCount >= course.capacity) {
    throw new AppError("Course capacity is full", 409);
  }

  return Enrollment.create({
    studentId,
    courseId,
    semesterId,
    enrollmentDate:
      enrollmentDate || new Date().toISOString().split("T")[0],
    status: "ACTIVE",
  });
};