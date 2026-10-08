import express from "express";

import {
  createEnrollmentController,
  getEnrollmentsController,
  getEnrollmentByIdController,
  updateEnrollmentController,
  dropEnrollmentController,
  getMyEnrollmentsController,
  getMyEnrollmentByIdController,
  createMyEnrollmentController,
  dropMyEnrollmentController,
} from "../controllers/enrollmentController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

/*
 * STUDENT SELF-SERVICE
 */

// Enroll yourself in a course
router.post(
  "/me",
  authenticate,
  requirePermission("OWN_ENROLLMENT_CREATE_DROP"),
  createMyEnrollmentController
);

// View your enrollments
router.get(
  "/me",
  authenticate,
  requirePermission("OWN_ENROLLMENT_VIEW"),
  getMyEnrollmentsController
);

// View one of your enrollments
router.get(
  "/me/:id",
  authenticate,
  requirePermission("OWN_ENROLLMENT_VIEW"),
  getMyEnrollmentByIdController
);

// Drop your own enrollment
router.patch(
  "/me/:id/drop",
  authenticate,
  requirePermission("OWN_ENROLLMENT_CREATE_DROP"),
  dropMyEnrollmentController
);


/*
 * ADMIN / SUPER_ADMIN
 */

// Create enrollment for any student
router.post(
  "/",
  authenticate,
  requirePermission("ENROLLMENT_CREATE_UPDATE_DROP"),
  createEnrollmentController
);

// View all enrollments
router.get(
  "/",
  authenticate,
  requirePermission("ENROLLMENT_VIEW_ALL"),
  getEnrollmentsController
);

// View one enrollment
router.get(
  "/:id",
  authenticate,
  requirePermission("ENROLLMENT_VIEW_ALL"),
  getEnrollmentByIdController
);

// Update enrollment
router.put(
  "/:id",
  authenticate,
  requirePermission("ENROLLMENT_CREATE_UPDATE_DROP"),
  updateEnrollmentController
);

// Drop any enrollment
router.patch(
  "/:id/drop",
  authenticate,
  requirePermission("ENROLLMENT_CREATE_UPDATE_DROP"),
  dropEnrollmentController
);

export default router;