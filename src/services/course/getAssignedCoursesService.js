import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Instructor, Department } = db;

export const getAssignedCourses = async (userId) => {
  const instructor = await Instructor.findOne({
    where: {
      userId,
    },
  });

  if (!instructor) {
    throw new AppError("Instructor profile not found", 404);
  }

  return Course.findAll({
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
  });
};