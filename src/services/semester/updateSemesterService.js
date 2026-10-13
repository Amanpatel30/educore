import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { requireDate } from "../../utils/validate.js";

const { Semester } = db;

const UPDATABLE_FIELDS = ["name", "academicYear", "startDate", "endDate"];

export const updateSemester = async (id, data) => {
  const semester = await Semester.findByPk(id);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  /*
   * Status moves through PATCH /open and /close, which enforce the state
   * machine. Accepting it here would let a closed semester be reopened by a
   * plain update, silently bypassing that.
   */
  if (data.status !== undefined) {
    throw new AppError(
      "status is changed through PATCH /api/semesters/:id/open or /close",
      400
    );
  }

  if (!UPDATABLE_FIELDS.some((field) => data[field] !== undefined)) {
    throw new AppError(
      `No supported fields to update. Send one of: ${UPDATABLE_FIELDS.join(", ")}`,
      400
    );
  }

  const {
    name,
    academicYear,
    startDate,
    endDate,
  } = data;

  const newStartDate =
    startDate === undefined ? semester.startDate : requireDate(startDate, "startDate");
  const newEndDate =
    endDate === undefined ? semester.endDate : requireDate(endDate, "endDate");

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
