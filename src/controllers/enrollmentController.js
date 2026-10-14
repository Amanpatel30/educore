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

import { ok, created, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import {
  parseIdQuery,
  parseSearchQuery,
  parseStringQuery,
} from "../utils/query.js";

const ENROLLMENT_SORT_FIELDS = ["enrollmentDate", "status", "grade", "createdAt"];
const ENROLLMENT_SORT_ORDERS = ["asc", "desc"];
const ENROLLMENT_STATUS_FILTERS = ["ACTIVE", "DROPPED", "COMPLETED"];

/*
 * ADMIN / SUPER_ADMIN
 */

export const createEnrollmentController = asyncHandler(
  async (req, res) => {
    const enrollment = await createEnrollment(req.body, req.user.id);

    return created(
      res,
      { enrollment },
      "Enrollment created successfully"
    );
  }
);

export const getEnrollmentsController = asyncHandler(
  async (req, res) => {
    const pagination = getPagination(req.query);

    const sort = parseStringQuery(req.query.sort, {
      label: "sort",
      allowed: ENROLLMENT_SORT_FIELDS,
    });
    const order = parseStringQuery(req.query.order, {
      label: "order",
      allowed: ENROLLMENT_SORT_ORDERS,
    });
    const status = parseStringQuery(req.query.status, {
      label: "status",
      allowed: ENROLLMENT_STATUS_FILTERS,
    });
    const semesterId = parseIdQuery(req.query.semesterId, "semesterId");
    const courseId = parseIdQuery(req.query.courseId, "courseId");
    const search = parseSearchQuery(req.query.search);

    const result = await getEnrollments(pagination, {
      search,
      status,
      semesterId,
      courseId,
      ...(sort && { sort }),
      ...(order && { order: order.toUpperCase() }),
    });

    return okList(res, "enrollments", result, pagination);
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
      req.body,
      req.user.id
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
      req.params.id,
      req.user.id
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
    const pagination = getPagination(req.query);

    const sort = parseStringQuery(req.query.sort, {
      label: "sort",
      allowed: ENROLLMENT_SORT_FIELDS,
    });
    const order = parseStringQuery(req.query.order, {
      label: "order",
      allowed: ENROLLMENT_SORT_ORDERS,
    });
    const status = parseStringQuery(req.query.status, {
      label: "status",
      allowed: ENROLLMENT_STATUS_FILTERS,
    });
    const semesterId = parseIdQuery(req.query.semesterId, "semesterId");
    const search = parseSearchQuery(req.query.search);

    const result = await getMyEnrollments(
      req.user.id,
      pagination,
      {
        search,
        status,
        semesterId,
        ...(sort && { sort }),
        ...(order && { order: order.toUpperCase() }),
      }
    );

    return okList(res, "enrollments", result, pagination);
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