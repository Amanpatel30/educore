import { getInstructors } from "../services/instructor/getInstructorsService.js";
import { getInstructorById } from "../services/instructor/getInstructorByIdService.js";
import { updateInstructor } from "../services/instructor/updateInstructorService.js";

import { ok, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import {
  parseIdQuery,
  parseSearchQuery,
  parseStringQuery,
} from "../utils/query.js";

export const getInstructorsController = asyncHandler(
  async (req, res) => {
    const pagination = getPagination(req.query);

    const result = await getInstructors({
      pagination,
      departmentId: parseIdQuery(
        req.query.departmentId,
        "departmentId"
      ),
      status: parseStringQuery(req.query.status, {
        label: "status",
        allowed: ["ACTIVE", "INACTIVE"],
      }),
      search: parseSearchQuery(req.query.search),
    });

    return okList(res, "instructors", result, pagination);
  }
);

export const getInstructorByIdController = asyncHandler(
  async (req, res) => {
    const instructor = await getInstructorById(req.params.id);

    return ok(res, { instructor });
  }
);

export const updateInstructorController = asyncHandler(
  async (req, res) => {
    const instructor = await updateInstructor({
      actorId: req.user.id,
      instructorId: req.params.id,
      body: req.body,
    });

    return ok(res, { instructor }, "Instructor updated successfully");
  }
);
