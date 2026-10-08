import { createSemester } from "../services/semester/createSemesterService.js";
import { getSemesters } from "../services/semester/getSemestersService.js";
import { getSemesterById } from "../services/semester/getSemesterByIdService.js";
import { updateSemester } from "../services/semester/updateSemesterService.js";
import { deleteSemester } from "../services/semester/deleteSemesterService.js";
import { openSemester } from "../services/semester/openSemesterService.js";
import { closeSemester } from "../services/semester/closeSemesterService.js";

import { ok, created, noContent } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createSemesterController = asyncHandler(
  async (req, res) => {
    const semester = await createSemester(req.body);

    return created(
      res,
      { semester },
      "Semester created successfully"
    );
  }
);

export const getSemestersController = asyncHandler(
  async (req, res) => {
    const semesters = await getSemesters();

    return ok(res, {
      count: semesters.length,
      semesters,
    });
  }
);

export const getSemesterByIdController = asyncHandler(
  async (req, res) => {
    const semester = await getSemesterById(req.params.id);

    return ok(res, {
      semester,
    });
  }
);

export const updateSemesterController = asyncHandler(
  async (req, res) => {
    const semester = await updateSemester(
      req.params.id,
      req.body
    );

    return ok(
      res,
      { semester },
      "Semester updated successfully"
    );
  }
);

export const deleteSemesterController = asyncHandler(
  async (req, res) => {
    await deleteSemester(req.params.id);

    return noContent(res);
  }
);

export const openSemesterController = asyncHandler(
  async (req, res) => {
    const semester = await openSemester(req.params.id);

    return ok(
      res,
      { semester },
      "Semester opened successfully"
    );
  }
);

export const closeSemesterController = asyncHandler(
  async (req, res) => {
    const semester = await closeSemester(req.params.id);

    return ok(
      res,
      { semester },
      "Semester closed successfully"
    );
  }
);