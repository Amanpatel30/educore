import { createSemester } from "../services/semester/createSemesterService.js";
import { getSemesters } from "../services/semester/getSemestersService.js";
import { getSemesterById } from "../services/semester/getSemesterByIdService.js";
import { updateSemester } from "../services/semester/updateSemesterService.js";
import { deleteSemester } from "../services/semester/deleteSemesterService.js";
import { openSemester } from "../services/semester/openSemesterService.js";
import { closeSemester } from "../services/semester/closeSemesterService.js";

import { ok, created, noContent, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import { parseSearchQuery, parseStringQuery } from "../utils/query.js";

const SORT_FIELDS = ["name", "academicYear", "startDate", "endDate", "status", "createdAt"];
const SORT_ORDERS = ["asc", "desc"];
const STATUS_FILTERS = ["UPCOMING", "OPEN", "CLOSED"];

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
    const pagination = getPagination(req.query);

    const sort = parseStringQuery(req.query.sort, {
      label: "sort",
      allowed: SORT_FIELDS,
    });
    const order = parseStringQuery(req.query.order, {
      label: "order",
      allowed: SORT_ORDERS,
    });
    const status = parseStringQuery(req.query.status, {
      label: "status",
      allowed: STATUS_FILTERS,
    });

    const result = await getSemesters(pagination, {
      search: parseSearchQuery(req.query.search),
      status,
      ...(sort && { sort }),
      ...(order && { order: order.toUpperCase() }),
    });

    return okList(res, "semesters", result, pagination);
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