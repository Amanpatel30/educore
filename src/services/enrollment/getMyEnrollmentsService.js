import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const {
  Enrollment,
  Student,
  Course,
  Department,
  Semester,
} = db;

export const getMyEnrollments = async (userId, pagination = null) => {
  const student = await Student.findOne({
    where: {
      userId,
    },
  });

  if (!student) {
    throw new AppError("Student profile not found", 404);
  }

  const { rows, count } = await Enrollment.findAndCountAll({
    where: {
      studentId: student.id,
    },

    include: [
      {
        model: Course,
        as: "course",
        attributes: ["id", "code", "name", "credits"],

        include: [
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
          "startDate",
          "endDate",
          "status",
        ],
      },
    ],

    order: [["createdAt", "DESC"]],

    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};