import { Op } from "sequelize";
import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Course, Instructor, Department } = db;

export const getAssignedCourses = async (
  userId,
  pagination = null,
  { search, departmentId, sort = "code", order = "ASC" } = {}
) => {
  const instructor = await Instructor.findOne({
    where: {
      userId,
    },
  });

  if (!instructor) {
    throw new AppError("Instructor profile not found", 404);
  }

  const where = {
    isActive: true,
  };

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (search) {
    where[Op.or] = [
      { code: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Course.findAndCountAll({
    where,

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

    order: [[sort, order]],

    // The instructor join can multiply rows, so count distinct courses.
    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};
