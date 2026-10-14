import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { roleHasPermission } from "../../middleware/permissionMiddleware.js";

const {
  Course,
  Enrollment,
  Student,
  User,
  Department,
  Semester,
  Instructor,
  CourseInstructor,
} = db;

export const getCourseEnrollments = async (courseId, user) => {
  const course = await Course.findByPk(courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  // Check authorization:
  // Admins with ENROLLMENT_VIEW_ALL or ACADEMIC_DATA_MANAGE_ALL can view any course roster.
  // Instructors must hold STUDENT_ROSTER_VIEW AND be assigned to the course.
  const hasGlobalAccess =
    (await roleHasPermission(user.roleId, "ENROLLMENT_VIEW_ALL")) ||
    (await roleHasPermission(user.roleId, "ACADEMIC_DATA_MANAGE_ALL"));

  if (!hasGlobalAccess) {
    const hasRosterPermission = await roleHasPermission(
      user.roleId,
      "STUDENT_ROSTER_VIEW"
    );

    if (!hasRosterPermission) {
      throw new AppError(
        "You do not have permission to perform this action",
        403
      );
    }

    // Verify instructor assignment to this course
    const instructor = await Instructor.findOne({
      where: { userId: user.id },
    });

    if (!instructor) {
      throw new AppError("Instructor profile not found", 403);
    }

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

  const enrollments = await Enrollment.findAll({
    where: {
      courseId,
    },
    include: [
      {
        model: Student,
        as: "student",
        attributes: ["id", "userId", "studentCode", "status"],
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
        ],
      },
      {
        model: Semester,
        as: "semester",
        attributes: [
          "id",
          "name",
          "academicYear",
          "status",
          "startDate",
          "endDate",
        ],
      },
    ],
    order: [
      [{ model: Semester, as: "semester" }, "startDate", "DESC"],
      [{ model: Student, as: "student" }, "studentCode", "ASC"],
    ],
  });

  return enrollments;
};

