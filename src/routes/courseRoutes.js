import express from "express";

import {
  getCourseCatalog,
  getPublicCoursesController,
  getPublicCourseByIdController,
  createCourseController,
  updateCourseController,
  getCourseByIdController,
  deleteCourseController,
  assignCourseController,
  getAssignedCoursesController,
  removeCourseAssignmentController,
  getCourseInstructorsController,
  getCourseEnrollmentsController,
  recordGradeController,
} from "../controllers/courseController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

// PUBLIC READ-ONLY
router.get("/public", getPublicCoursesController);
router.get("/public/:id", getPublicCourseByIdController);

numericParams(router, "id", "courseId", "instructorId", "enrollmentId");

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

router.get(
  "/:id/instructors",
  authenticate,
  requirePermission("COURSE_ASSIGN"),
  getCourseInstructorsController
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

router.get(
  "/:id/enrollments",
  authenticate,
  requirePermission("STUDENT_ROSTER_VIEW", "ENROLLMENT_VIEW_ALL"),
  getCourseEnrollmentsController
);

router.patch(
  "/:courseId/enrollments/:enrollmentId/grade",
  authenticate,
  requirePermission("GRADE_CREATE_UPDATE", "ENROLLMENT_CREATE_UPDATE_DROP"),
  recordGradeController
);

router.put(
  "/:courseId/enrollments/:enrollmentId/grade",
  authenticate,
  requirePermission("GRADE_CREATE_UPDATE", "ENROLLMENT_CREATE_UPDATE_DROP"),
  recordGradeController
);

export default router;