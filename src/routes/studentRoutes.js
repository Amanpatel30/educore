import express from "express";

import {
  getStudentByIdController,
  getStudentsController,
} from "../controllers/studentController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id");

/*
 * STUDENT_ROSTER_VIEW is deliberately not accepted here: it exists for an
 * instructor reading the roster of a course they teach, which is a different
 * endpoint. This one exposes every student's account and department.
 */
router.get(
  "/",
  authenticate,
  requirePermission("STUDENT_MANAGE"),
  getStudentsController
);

router.get(
  "/:id",
  authenticate,
  requirePermission("STUDENT_MANAGE"),
  getStudentByIdController
);

export default router;
