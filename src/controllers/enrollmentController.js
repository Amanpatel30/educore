import {
  createEnrollment,
} from "../services/enrollment/createEnrollmentService.js";

import {
  getEnrollments,
} from "../services/enrollment/getEnrollmentsService.js";

import {
  getEnrollmentById,
} from "../services/enrollment/getEnrollmentByIdService.js";

import {
  updateEnrollment,
} from "../services/enrollment/updateEnrollmentService.js";

import {
  dropEnrollment,
} from "../services/enrollment/dropEnrollmentService.js";

import {
  getMyEnrollments,
} from "../services/enrollment/getMyEnrollmentsService.js";

import {
  getMyEnrollmentById,
} from "../services/enrollment/getMyEnrollmentByIdService.js";

import {
  createMyEnrollment,
} from "../services/enrollment/createMyEnrollmentService.js";

import {
  dropMyEnrollment,
} from "../services/enrollment/dropMyEnrollmentService.js";

import { ok, created } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/*
 * ADMIN / SUPER_ADMIN
 */

export const createEnrollmentController = asyncHandler(
  async (req, res) => {
    const enrollment = await createEnrollment(req.body);

    return created(
      res,
      { enrollment },
      "Enrollment created successfully"
    );
  }
);

export const getEnrollmentsController = asyncHandler(
  async (req, res) => {
    const enrollments = await getEnrollments();

    return ok(res, {
      count: enrollments.length,
      enrollments,
    });
  }
);

export const getEnrollmentByIdController = asyncHandler(
  async (req, res) => {
    const enrollment = await getEnrollmentById(
      req.params.id
    );

    return ok(res, {
      enrollment,
    });
  }
);

export const updateEnrollmentController = asyncHandler(
  async (req, res) => {
    const enrollment = await updateEnrollment(
      req.params.id,
      req.body
    );

    return ok(
      res,
      { enrollment },
      "Enrollment updated successfully"
    );
  }
);

export const dropEnrollmentController = asyncHandler(
  async (req, res) => {
    const enrollment = await dropEnrollment(
      req.params.id
    );

    return ok(
      res,
      { enrollment },
      "Enrollment dropped successfully"
    );
  }
);


/*
 * STUDENT SELF-SERVICE
 */

export const createMyEnrollmentController = asyncHandler(
  async (req, res) => {
    const enrollment = await createMyEnrollment(
      req.user.id,
      req.body
    );

    return created(
      res,
      { enrollment },
      "Course enrollment successful"
    );
  }
);

export const getMyEnrollmentsController = asyncHandler(
  async (req, res) => {
    const enrollments = await getMyEnrollments(
      req.user.id
    );

    return ok(res, {
      count: enrollments.length,
      enrollments,
    });
  }
);

export const getMyEnrollmentByIdController = asyncHandler(
  async (req, res) => {
    const enrollment = await getMyEnrollmentById(
      req.user.id,
      req.params.id
    );

    return ok(res, {
      enrollment,
    });
  }
);

export const dropMyEnrollmentController = asyncHandler(
  async (req, res) => {
    const enrollment = await dropMyEnrollment(
      req.user.id,
      req.params.id
    );

    return ok(
      res,
      { enrollment },
      "Enrollment dropped successfully"
    );
  }
);