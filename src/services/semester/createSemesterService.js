import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Semester } = db;

const VALID_STATUSES = ["UPCOMING", "OPEN", "CLOSED"];

export const createSemester = async (data) => {
  const {
    name,
    academicYear,
    startDate,
    endDate,
    status = "UPCOMING",
  } = data;

  if (!name || !academicYear || !startDate || !endDate) {
    throw new AppError(
      "name, academicYear, startDate and endDate are required",
      400
    );
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new AppError(
      "Invalid semester status. Use UPCOMING, OPEN or CLOSED",
      400
    );
  }

  if (new Date(startDate) >= new Date(endDate)) {
    throw new AppError(
      "startDate must be before endDate",
      400
    );
  }

  const existingSemester = await Semester.findOne({
    where: {
      name,
      academicYear,
    },
  });

  if (existingSemester) {
    throw new AppError(
      "Semester already exists for this academic year",
      409
    );
  }

  return Semester.create({
    name,
    academicYear,
    startDate,
    endDate,
    status,
  });
};