import {
  getCourses,
} from "../services/course/getCoursesService.js";

import {
  createCourse,
} from "../services/course/createCourseService.js";

import {
  updateCourse,
} from "../services/course/updateCourseService.js";

import { getCourseById } from "../services/course/getCourseByIdService.js";
import { deleteCourse } from "../services/course/deleteCourseService.js";

import { assignCourse } from "../services/course/assignCourseService.js";
import { getAssignedCourses } from "../services/course/getAssignedCoursesService.js";
import { removeCourseAssignment } from "../services/course/removeCourseAssignmentService.js";



import { ok, created, noContent, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import {
  parseIdQuery,
  parseSearchQuery,
  parseStringQuery,
} from "../utils/query.js";
import { AppError } from "../utils/AppError.js";
import { roleHasPermission } from "../middleware/permissionMiddleware.js";

const SORT_FIELDS = ["code", "name", "credits", "capacity", "createdAt"];
const SORT_ORDERS = ["asc", "desc"];
const ACTIVE_FILTERS = ["true", "false", "all"];

export const getCourseCatalog = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);

  const isActive = parseStringQuery(req.query.isActive, {
    label: "isActive",
    allowed: ACTIVE_FILTERS,
  });

  /*
   * The catalog is a student-facing list of what can be enrolled in, so the
   * default stays active-only. Seeing retired courses is an admin need.
   */
  if (isActive !== undefined && isActive !== "true") {
    if (!(await roleHasPermission(req.user.roleId, "COURSE_CREATE_UPDATE"))) {
      throw new AppError(
        "You do not have permission to perform this action",
        403
      );
    }
  }

  const sort = parseStringQuery(req.query.sort, {
    label: "sort",
    allowed: SORT_FIELDS,
  });
  const order = parseStringQuery(req.query.order, {
    label: "order",
    allowed: SORT_ORDERS,
  });

  const result = await getCourses(pagination, {
    search: parseSearchQuery(req.query.search),
    departmentId: parseIdQuery(req.query.departmentId, "departmentId"),
    // `all` means no filter at all; anything else is a boolean.
    isActive:
      isActive === "all" ? undefined : isActive === "false" ? false : true,
    ...(sort && { sort }),
    ...(order && { order: order.toUpperCase() }),
  });

  return okList(res, "courses", result, pagination);
});

export const getPublicCoursesController = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);

  const sort = parseStringQuery(req.query.sort, {
    label: "sort",
    allowed: SORT_FIELDS,
  });
  const order = parseStringQuery(req.query.order, {
    label: "order",
    allowed: SORT_ORDERS,
  });

  const result = await getCourses(pagination, {
    search: parseSearchQuery(req.query.search),
    departmentId: parseIdQuery(req.query.departmentId, "departmentId"),
    isActive: true,
    ...(sort && { sort }),
    ...(order && { order: order.toUpperCase() }),
  });

  return okList(res, "courses", result, pagination);
});

export const getPublicCourseByIdController = asyncHandler(async (req, res) => {
  const course = await getCourseById(req.params.id);

  if (!course.isActive) {
    throw new AppError("Course not found", 404);
  }

  return ok(res, {
    course,
  });
});

export const createCourseController = asyncHandler(async (req, res) => {
  const course = await createCourse(req.body);

  return created(res, {
    course,
  });
});

export const updateCourseController = asyncHandler(async (req, res) => {
  const course = await updateCourse(req.params.id, req.body);

  return ok(res, {
    course,
  });
});


export const getCourseByIdController = asyncHandler(async (req, res) => {
  const course = await getCourseById(req.params.id);

  return ok(res, {
    course,
  });
});

export const deleteCourseController = asyncHandler(async (req, res) => {
  await deleteCourse(req.params.id);

  return noContent(res);
});

export const assignCourseController = asyncHandler(async (req, res) => {
  const assignment = await assignCourse(
    req.params.courseId,
    req.body.instructorId
  );

  return created(
    res,
    { assignment },
    "Course assigned successfully"
  );
});


export const getAssignedCoursesController = asyncHandler(
  async (req, res) => {
    const pagination = getPagination(req.query);

    const sort = parseStringQuery(req.query.sort, {
      label: "sort",
      allowed: SORT_FIELDS,
    });
    const order = parseStringQuery(req.query.order, {
      label: "order",
      allowed: SORT_ORDERS,
    });

    const result = await getAssignedCourses(req.user.id, pagination, {
      search: parseSearchQuery(req.query.search),
      departmentId: parseIdQuery(req.query.departmentId, "departmentId"),
      ...(sort && { sort }),
      ...(order && { order: order.toUpperCase() }),
    });

    return okList(res, "courses", result, pagination);
  }
);

export const removeCourseAssignmentController = asyncHandler(
  async (req, res) => {
    await removeCourseAssignment(
      req.params.courseId,
      req.params.instructorId
    );

    return noContent(res);
  }
);

