import { Op } from "sequelize";
import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const {
  Enrollment,
  Student,
  Course,
  Department,
  Semester,
} = db;

export const getMyEnrollments = async (
  userId,
  pagination = null,
  { search, status, semesterId, sort = "createdAt", order = "DESC" } = {}
) => {
  const student = await Student.findOne({
    where: {
      userId,
    },
  });

  if (!student) {
    return { rows: [], total: 0 };
  }

  const where = {
    studentId: student.id,
  };

  if (status) {
    where.status = status;
  }
  if (semesterId) {
    where.semesterId = semesterId;
  }

  if (search) {
    where[Op.or] = [
      { "$course.code$": { [Op.iLike]: `%${search}%` } },
      { "$course.name$": { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Enrollment.findAndCountAll({
    where,

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

    order: [[sort, order]],
    subQuery: false,

    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};