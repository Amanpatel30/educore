import { Op } from "sequelize";
import db from "../../../models/index.js";

const {
  Enrollment,
  Student,
  User,
  Course,
  Department,
  Semester,
} = db;

export const getEnrollments = async (
  pagination = null,
  { search, status, semesterId, courseId, sort = "createdAt", order = "DESC" } = {}
) => {
  const where = {};

  if (status) {
    where.status = status;
  }
  if (semesterId) {
    where.semesterId = semesterId;
  }
  if (courseId) {
    where.courseId = courseId;
  }

  if (search) {
    where[Op.or] = [
      { "$course.code$": { [Op.iLike]: `%${search}%` } },
      { "$course.name$": { [Op.iLike]: `%${search}%` } },
      { "$student.studentCode$": { [Op.iLike]: `%${search}%` } },
      { "$student.user.name$": { [Op.iLike]: `%${search}%` } },
      { "$student.user.email$": { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Enrollment.findAndCountAll({
    where,
    include: [
      {
        model: Student,
        as: "student",
        attributes: ["id", "studentCode", "status"],

        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "email"],
          },
        ],
      },

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