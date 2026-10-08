import db from "../../../models/index.js";

const { Semester } = db;

export const getSemesters = async () => {
  return Semester.findAll({
    order: [
      ["startDate", "DESC"],
    ],
  });
};