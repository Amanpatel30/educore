import express from "express";

import {
  getInstructorsController,
  getInstructorByIdController,
  updateInstructorController,
} from "../controllers/instructorController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id");

router.get(
  "/",
  authenticate,
  requirePermission("INSTRUCTOR_MANAGE"),
  getInstructorsController
);

router.get(
  "/:id",
  authenticate,
  requirePermission("INSTRUCTOR_MANAGE"),
  getInstructorByIdController
);

/*
 * Profile fields only. An instructor account is created through POST /api/users,
 * which writes the user and the profile in one transaction.
 */
router.put(
  "/:id",
  authenticate,
  requirePermission("INSTRUCTOR_MANAGE"),
  updateInstructorController
);

export default router;
