import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Semester } = db;

export const updateSemester = async (id, data) => {
  const semester = await Semester.findByPk(id);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  const {
    name,
    academicYear,
    startDate,
    endDate,
  } = data;

  const newStartDate = startDate ?? semester.startDate;
  const newEndDate = endDate ?? semester.endDate;

  if (new Date(newStartDate) >= new Date(newEndDate)) {
    throw new AppError(
      "startDate must be before endDate",
      400
    );
  }

  if (
    (name && name !== semester.name) ||
    (academicYear && academicYear !== semester.academicYear)
  ) {
    const existingSemester = await Semester.findOne({
      where: {
        name: name ?? semester.name,
        academicYear: academicYear ?? semester.academicYear,
      },
    });

    if (
      existingSemester &&
      String(existingSemester.id) !== String(id)
    ) {
      throw new AppError(
        "Semester already exists for this academic year",
        409
      );
    }
  }

  await semester.update({
    ...(name !== undefined && { name }),
    ...(academicYear !== undefined && { academicYear }),
    ...(startDate !== undefined && { startDate }),
    ...(endDate !== undefined && { endDate }),
  });

  return semester;
};