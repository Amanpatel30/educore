import db from "../../../models/index.js";

const {
  Enrollment,
  Student,
  User,
  Course,
  Department,
  Semester,
} = db;

export const getEnrollments = async (pagination = null) => {
  const { rows, count } = await Enrollment.findAndCountAll({
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

    order: [["createdAt", "DESC"]],

    ...(pagination && {
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    }),
  });

  return { rows, total: count };
};