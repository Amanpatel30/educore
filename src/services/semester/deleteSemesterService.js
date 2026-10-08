import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const { Semester, Enrollment } = db;

export const deleteSemester = async (id) => {
  const semester = await Semester.findByPk(id);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  const enrollmentCount = await Enrollment.count({
    where: {
      semesterId: id,
    },
  });

  if (enrollmentCount > 0) {
    throw new AppError(
      "Cannot delete a semester that has enrollments",
      409
    );
  }

  await semester.destroy();
};