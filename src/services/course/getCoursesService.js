import db from "../../../models/index.js";

const { Course, Department } = db;

export const getCourses = async () => {
  return Course.findAll({
    where: {
      isActive: true,
    },
    include: [
      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
      },
    ],
    order: [["code", "ASC"]],
  });
};

