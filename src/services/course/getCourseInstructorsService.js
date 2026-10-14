import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Instructor, User, Department } = db;

export const getCourseInstructors = async (courseId) => {
  const course = await Course.findByPk(courseId, {
    include: [
      {
        model: Instructor,
        as: "instructors",
        attributes: [
          "id",
          "userId",
          "departmentId",
          "employeeCode",
          "designation",
          "status",
        ],
        through: {
          attributes: ["assignedAt"],
        },
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
    ],
    order: [
      [{ model: Instructor, as: "instructors" }, "employeeCode", "ASC"],
    ],
  });

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  return course.instructors || [];
};

