import express from "express";

import {
  getCourseCatalog,
  createCourseController,
  updateCourseController,
  getCourseByIdController,
  deleteCourseController,
  assignCourseController,
   getAssignedCoursesController,
  removeCourseAssignmentController,
} from "../controllers/courseController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id", "courseId", "instructorId");

// STUDENT
router.get(
  "/catalog",
  authenticate,
  requirePermission("COURSE_CATALOG_VIEW"),
  getCourseCatalog
);

// ADMIN + SUPER_ADMIN
router.post(
  "/",
  authenticate,
  requirePermission("COURSE_CREATE_UPDATE"),
  createCourseController
);
router.get(
  "/instructors/me/courses",
  authenticate,
  requirePermission("ASSIGNED_COURSE_VIEW"),
  getAssignedCoursesController
);

router.put(
  "/:id",
  authenticate,
  requirePermission("COURSE_CREATE_UPDATE"),
  updateCourseController
);

router.get(
  "/:id",
  authenticate,
  requirePermission("COURSE_CATALOG_VIEW"),
  getCourseByIdController
);

router.delete(
  "/:id",
  authenticate,
  requirePermission("COURSE_CREATE_UPDATE"),
  deleteCourseController
);

router.post(
  "/:courseId/instructors",
  authenticate,
  requirePermission("COURSE_ASSIGN"),
  assignCourseController
);

router.delete(
  "/:courseId/instructors/:instructorId",
  authenticate,
  requirePermission("COURSE_ASSIGN"),
  removeCourseAssignmentController
);

export default router;