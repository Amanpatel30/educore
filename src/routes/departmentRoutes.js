import express from "express";

import {
  getDepartmentsController,
  getDepartmentByIdController,
  createDepartmentController,
  updateDepartmentController,
  deleteDepartmentController,
} from "../controllers/departmentController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id");

router.get(
  "/",
  authenticate,
  requirePermission("DEPARTMENT_MANAGE"),
  getDepartmentsController
);

router.post(
  "/",
  authenticate,
  requirePermission("DEPARTMENT_MANAGE"),
  createDepartmentController
);

router.get(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_MANAGE"),
  getDepartmentByIdController
);

router.put(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_MANAGE"),
  updateDepartmentController
);

router.delete(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_MANAGE"),
  deleteDepartmentController
);

export default router;
