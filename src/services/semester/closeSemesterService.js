import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Semester } = db;

export const closeSemester = async (id) => {
  const semester = await Semester.findByPk(id);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  if (semester.status === "CLOSED") {
    throw new AppError("Semester is already closed", 409);
  }

  if (semester.status === "UPCOMING") {
    throw new AppError(
      "An upcoming semester cannot be closed",
      409
    );
  }

  await semester.update({
    status: "CLOSED",
  });

  return semester;
};