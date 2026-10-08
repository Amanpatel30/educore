import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Semester } = db;

export const getSemesterById = async (id) => {
  const semester = await Semester.findByPk(id);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  return semester;
};