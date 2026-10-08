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



import { ok, created, noContent } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getCourseCatalog = asyncHandler(async (req, res) => {
  const courses = await getCourses();

  return ok(res, {
    count: courses.length,
    courses,
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
    const courses = await getAssignedCourses(req.user.id);

    return ok(res, {
      count: courses.length,
      courses,
    });
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

