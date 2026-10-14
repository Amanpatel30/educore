import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { requireDate, requireTodayOrFutureDate } from "../../utils/validate.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const { Semester, sequelize } = db;

const UPDATABLE_FIELDS = ["name", "academicYear", "startDate", "endDate"];

export const updateSemester = async (id, data, actorId = null) => {
  return sequelize.transaction(async (transaction) => {
    const semester = await Semester.findByPk(id, { transaction });

    if (!semester) {
      throw new AppError("Semester not found", 404);
    }

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
      startDate === undefined ? semester.startDate : requireTodayOrFutureDate(startDate, "startDate");
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
        transaction,
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

    await semester.update(
      {
        ...(name !== undefined && { name }),
        ...(academicYear !== undefined && { academicYear }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
      },
      { transaction }
    );

    if (actorId) {
      await recordAdminOperation(
        {
          adminUserId: actorId,
          operation: "UPDATE_SEMESTER",
          targetType: "Semester",
          targetId: semester.id,
        },
        transaction
      );
    }

    return semester;
  });
};
