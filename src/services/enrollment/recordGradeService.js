import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { roleHasPermission } from "../../middleware/permissionMiddleware.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const {
  Course,
  Enrollment,
  Student,
  User,
  Semester,
  Instructor,
  CourseInstructor,
  sequelize,
} = db;

export const VALID_GRADES = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F", "P", "NP", "I", "W",
];

export const recordGrade = async ({
  courseId,
  enrollmentId,
  grade,
  user,
}) => {
  if (courseId) {
    const course = await Course.findByPk(courseId);
    if (!course) {
      throw new AppError("Course not found", 404);
    }
  }

  // Authorization check:
  // Admins with ENROLLMENT_CREATE_UPDATE_DROP or ACADEMIC_DATA_MANAGE_ALL can record any grade.
  // Instructors must hold GRADE_CREATE_UPDATE AND be assigned to the course.
  const hasAdminPermission =
    (await roleHasPermission(user.roleId, "ENROLLMENT_CREATE_UPDATE_DROP")) ||
    (await roleHasPermission(user.roleId, "ACADEMIC_DATA_MANAGE_ALL"));

  if (!hasAdminPermission) {
    const hasGradePermission = await roleHasPermission(
      user.roleId,
      "GRADE_CREATE_UPDATE"
    );

    if (!hasGradePermission) {
      throw new AppError(
        "You do not have permission to perform this action",
        403
      );
    }

    const instructor = await Instructor.findOne({
      where: { userId: user.id },
    });

    if (!instructor) {
      throw new AppError("Instructor profile not found", 403);
    }

    if (courseId) {
      const assignment = await CourseInstructor.findOne({
        where: {
          courseId,
          instructorId: instructor.id,
        },
      });

      if (!assignment) {
        throw new AppError("You are not assigned to teach this course", 403);
      }
    }
  }

  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [
      {
        model: Student,
        as: "student",
        attributes: ["id", "studentCode"],
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "email"],
          },
        ],
      },
      {
        model: Semester,
        as: "semester",
        attributes: ["id", "name", "academicYear", "status"],
      },
    ],
  });

  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  // If courseId wasn't passed directly in path, verify assignment on enrollment.courseId
  if (!courseId && !hasAdminPermission) {
    const instructor = await Instructor.findOne({
      where: { userId: user.id },
    });
    const assignment = await CourseInstructor.findOne({
      where: {
        courseId: enrollment.courseId,
        instructorId: instructor.id,
      },
    });

    if (!assignment) {
      throw new AppError("You are not assigned to teach this course", 403);
    }
  }

  // Cross-course check: prevent access to enrollments belonging to unrelated courses
  if (courseId && String(enrollment.courseId) !== String(courseId)) {
    throw new AppError("Enrollment does not belong to this course", 400);
  }

  // Dropped enrollments cannot receive grades
  if (enrollment.status === "DROPPED") {
    throw new AppError("Cannot record grade for a dropped enrollment", 400);
  }

  // Grade validation
  let normalizedGrade = null;
  if (grade !== null && grade !== undefined && grade !== "") {
    if (typeof grade !== "string") {
      throw new AppError("Grade must be a string or null", 400);
    }
    normalizedGrade = grade.trim().toUpperCase();
    if (!VALID_GRADES.includes(normalizedGrade)) {
      throw new AppError(
        `Invalid grade. Allowed grades: ${VALID_GRADES.join(", ")}`,
        400
      );
    }
  }

  await sequelize.transaction(async (transaction) => {
    await enrollment.update({ grade: normalizedGrade }, { transaction });

    if (user?.id) {
      await recordAdminOperation(
        {
          adminUserId: user.id,
          operation: "RECORD_GRADE",
          targetType: "Enrollment",
          targetId: enrollment.id,
        },
        transaction
      );
    }
  });

  return enrollment;
};

