import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { User, Role, Student, Course, Enrollment, sequelize } = db;

const studentCodeFor = (userId) => `STU${String(userId).padStart(5, "0")}`;

const handleDatabaseError = (error) => {
  if (error instanceof AppError) {
    throw error;
  }

  const databaseMessage =
    error?.original?.message ||
    error?.parent?.message ||
    error?.message ||
    "";

  if (databaseMessage.includes("Student not found")) {
    throw new AppError("Student not found", 404);
  }

  if (databaseMessage.includes("Student is not active")) {
    throw new AppError("Student is not active", 400);
  }

  if (databaseMessage.includes("Course not found")) {
    throw new AppError("Course not found", 404);
  }

  if (databaseMessage.includes("Course is not active")) {
    throw new AppError("Course is not active", 400);
  }

  if (databaseMessage.includes("Semester not found")) {
    throw new AppError("Semester not found", 404);
  }

  if (databaseMessage.includes("Semester is not open")) {
    throw new AppError("Enrollment is only allowed in an open semester", 400);
  }

  if (databaseMessage.includes("Student is already enrolled")) {
    throw new AppError(
      "Student is already enrolled in this course for this semester",
      409
    );
  }

  if (databaseMessage.includes("Course capacity is full")) {
    throw new AppError("Course capacity is full", 409);
  }

  if (error?.original?.code === "23505" || error?.parent?.code === "23505") {
    throw new AppError(
      "Student is already enrolled in this course for this semester",
      409
    );
  }

  throw error;
};

export const createMyEnrollment = async (userId, data) => {
  const { courseId, semesterId } = data || {};

  if (!courseId || !semesterId) {
    throw new AppError("courseId and semesterId are required", 400);
  }

  try {
    return await sequelize.transaction(async (transaction) => {
      // Lock the user record to serialize concurrent first-enrollment requests
      const user = await User.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      const course = await Course.findByPk(courseId, { transaction });
      if (!course) {
        throw new AppError("Course not found", 404);
      }

      if (!course.isActive) {
        throw new AppError("Course is not active", 400);
      }

      let student = await Student.findOne({
        where: { userId },
        transaction,
      });

      if (!student) {
        // Only student accounts can auto-provision a Student profile on first enrollment
        const role = await Role.findByPk(user.roleId, { transaction });
        if (role?.name !== "STUDENT") {
          throw new AppError("Student profile not found", 404);
        }

        student = await Student.create(
          {
            userId,
            departmentId: course.departmentId,
            studentCode: studentCodeFor(userId),
            admissionDate: new Date().toISOString().slice(0, 10),
            status: "ACTIVE",
          },
          { transaction }
        );
      }

      const [result] = await sequelize.query(
        `
          CALL public.create_enrollment(
            :studentId,
            :courseId,
            :semesterId,
            NULL
          )
        `,
        {
          replacements: {
            studentId: student.id,
            courseId,
            semesterId,
          },
          transaction,
        }
      );

      const enrollmentId = result?.[0]?.p_enrollment_id;
      if (!enrollmentId) {
        throw new AppError("Enrollment was not created", 500);
      }

      const createdEnrollment = await Enrollment.findByPk(enrollmentId, {
        transaction,
      });

      if (!createdEnrollment) {
        throw new AppError(
          "Enrollment was created but could not be retrieved",
          500
        );
      }

      return createdEnrollment;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
};