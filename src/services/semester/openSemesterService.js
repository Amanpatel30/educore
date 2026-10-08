import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Semester } = db;

export const openSemester = async (id) => {
  const semester = await Semester.findByPk(id);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  if (semester.status === "OPEN") {
    throw new AppError("Semester is already open", 409);
  }

  if (semester.status === "CLOSED") {
    throw new AppError(
      "A closed semester cannot be reopened",
      409
    );
  }

  await semester.update({
    status: "OPEN",
  });

  return semester;
};