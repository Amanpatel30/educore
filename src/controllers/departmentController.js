import { getDepartments } from "../services/department/getDepartmentsService.js";
import { getDepartmentById } from "../services/department/getDepartmentByIdService.js";
import { createDepartment } from "../services/department/createDepartmentService.js";
import { updateDepartment } from "../services/department/updateDepartmentService.js";
import { deleteDepartment } from "../services/department/deleteDepartmentService.js";

import { ok, created, noContent, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import {
  parseBooleanQuery,
  parseSearchQuery,
} from "../utils/query.js";

export const getDepartmentsController = asyncHandler(
  async (req, res) => {
    const pagination = getPagination(req.query);

    const result = await getDepartments({
      pagination,
      isActive: parseBooleanQuery(req.query.isActive, "isActive"),
      search: parseSearchQuery(req.query.search),
    });

    return okList(res, "departments", result, pagination);
  }
);

export const getDepartmentByIdController = asyncHandler(
  async (req, res) => {
    const department = await getDepartmentById(req.params.id);

    return ok(res, { department });
  }
);

export const createDepartmentController = asyncHandler(
  async (req, res) => {
    const department = await createDepartment(req.body);

    return created(
      res,
      { department },
      "Department created successfully"
    );
  }
);

export const updateDepartmentController = asyncHandler(
  async (req, res) => {
    const department = await updateDepartment(
      req.params.id,
      req.body
    );

    return ok(
      res,
      { department },
      "Department updated successfully"
    );
  }
);

export const deleteDepartmentController = asyncHandler(
  async (req, res) => {
    await deleteDepartment(req.params.id);

    return noContent(res);
  }
);
