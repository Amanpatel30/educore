import express from "express";

import {
  createSemesterController,
  getSemestersController,
  getSemesterByIdController,
  updateSemesterController,
  deleteSemesterController,
  openSemesterController,
  closeSemesterController,
} from "../controllers/semesterController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id");

router.get(
  "/",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  getSemestersController
);

router.post(
  "/",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  createSemesterController
);

router.get(
  "/:id",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  getSemesterByIdController
);

router.put(
  "/:id",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  updateSemesterController
);

router.patch(
  "/:id/open",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  openSemesterController
);

router.patch(
  "/:id/close",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  closeSemesterController
);

router.delete(
  "/:id",
  authenticate,
  requirePermission("SEMESTER_OPEN_CLOSE"),
  deleteSemesterController
);

export default router;