import { getStudents } from "../services/student/getStudentsService.js";
import { getStudentById } from "../services/student/getStudentByIdService.js";
import { ok, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import {
  parseIdQuery,
  parseSearchQuery,
  parseStringQuery,
} from "../utils/query.js";

export const getStudentsController = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);

  const result = await getStudents({
    pagination,
    departmentId: parseIdQuery(req.query.departmentId, "departmentId"),
    status: parseStringQuery(req.query.status, {
      label: "status",
      allowed: ["ACTIVE", "INACTIVE"],
    }),
    search: parseSearchQuery(req.query.search),
  });

  return okList(res, "students", result, pagination);
});

export const getStudentByIdController = asyncHandler(async (req, res) => {
  const student = await getStudentById(req.params.id);

  return ok(res, { student });
});
