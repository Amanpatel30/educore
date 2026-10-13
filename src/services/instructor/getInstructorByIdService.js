import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Instructor, User, Department, Course } = db;

export const getInstructorById = async (id) => {
  const instructor = await Instructor.findByPk(id, {
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
      {
        model: Course,
        as: "courses",
        attributes: ["id", "code", "name", "isActive"],
        through: { attributes: ["assignedAt"] },
      },
    ],
  });

  if (!instructor) {
    throw new AppError("Instructor not found", 404);
  }

  return instructor;
};
