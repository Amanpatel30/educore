import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { requireDate, requireTodayOrFutureDate } from "../../utils/validate.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Semester, sequelize } = db;

const VALID_STATUSES = ["UPCOMING", "OPEN", "CLOSED"];

export const createSemester = async (data, actorId = null) => {
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

  const start = requireTodayOrFutureDate(startDate, "startDate");
  const end = requireDate(endDate, "endDate");

  if (new Date(start) >= new Date(end)) {
    throw new AppError(
      "startDate must be before endDate",
      400
    );
  }

  return sequelize.transaction(async (transaction) => {
    const existingSemester = await Semester.findOne({
      where: {
        name,
        academicYear,
      },
      transaction,
    });

    if (existingSemester) {
      throw new AppError(
        "Semester already exists for this academic year",
        409
      );
    }

    const semester = await Semester.create(
      {
        name,
        academicYear,
        startDate,
        endDate,
        status,
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "CREATE_SEMESTER",
          targetType: "Semester",
          targetId: semester.id,
        },
        transaction
      );
    }

    return semester;
  });
};