import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Instructor, Department } = db;

export const getAssignedCourses = async (userId, pagination = null) => {
  const instructor = await Instructor.findOne({
    where: {
      userId,
    },
  });

  if (!instructor) {
    throw new AppError("Instructor profile not found", 404);
  }

  const { rows, count } = await Course.findAndCountAll({
    where: {
      isActive: true,
    },

    include: [
      {
        model: Instructor,
        as: "instructors",
        where: {
          id: instructor.id,
        },
        attributes: ["id", "employeeCode", "designation"],
        through: {
          attributes: ["assignedAt"],
        },
      },

      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
      },
    ],

    order: [["code", "ASC"]],

    // The instructor join can multiply rows, so count distinct courses.
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};
