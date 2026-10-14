import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const {
  Enrollment,
  Student,
  Course,
  Semester,
  sequelize,
} = db;

export const updateEnrollment = async (id, data, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const enrollment = await Enrollment.findByPk(id, { transaction });

    if (!enrollment) {
      throw new AppError("Enrollment not found", 404);
    }

    if (enrollment.status === "DROPPED") {
      throw new AppError(
        "A dropped enrollment cannot be updated",
        409
      );
    }

    const studentId = data.studentId ?? enrollment.studentId;
    const courseId = data.courseId ?? enrollment.courseId;
    const semesterId = data.semesterId ?? enrollment.semesterId;

    const student = await Student.findByPk(studentId, { transaction });

    if (!student) {
      throw new AppError("Student not found", 404);
    }

    if (student.status !== "ACTIVE") {
      throw new AppError("Student is not active", 400);
    }

    const course = await Course.findByPk(courseId, { transaction });

    if (!course) {
      throw new AppError("Course not found", 404);
    }

    if (!course.isActive) {
      throw new AppError("Course is not active", 400);
    }

    const semester = await Semester.findByPk(semesterId, { transaction });

    if (!semester) {
      throw new AppError("Semester not found", 404);
    }

    if (semester.status !== "OPEN") {
      throw new AppError(
        "Enrollment can only belong to an open semester",
        400
      );
    }

    const duplicateEnrollment = await Enrollment.findOne({
      where: {
        studentId,
        courseId,
        semesterId,
      },
      transaction,
    });

    if (
      duplicateEnrollment &&
      String(duplicateEnrollment.id) !== String(id)
    ) {
      throw new AppError(
        "Another enrollment already exists for this student, course and semester",
        409
      );
    }

    await enrollment.update(
      {
        studentId,
        courseId,
        semesterId,

        ...(data.enrollmentDate !== undefined && {
          enrollmentDate: data.enrollmentDate,
        }),
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "UPDATE_ENROLLMENT",
          targetType: "Enrollment",
          targetId: enrollment.id,
        },
        transaction
      );
    }

    return enrollment;
  });
};