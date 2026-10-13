"use strict";

/*
 * Lookup indexes for queries the application actually issues. Foreign-key
 * columns are not indexed automatically by PostgreSQL, so every filter and
 * join on them was a sequential scan:
 *
 *   - User_Sessions was scanned on every refresh and logout: both look the
 *     session up by refreshTokenHash, and refresh takes a row lock on it.
 *     SHA-256 hashes of 64 random bytes are unique by construction.
 *   - The stored procedure counts a course's seats with
 *     courseId + semesterId + status = 'ACTIVE'.
 *   - The list endpoints filter courses, students and instructors by
 *     departmentId, and courses by their instructor assignments.
 *   - The audit list orders by createdAt and can filter by operation.
 *
 * CREATE INDEX IF NOT EXISTS keeps this safe to re-run against a database that
 * already has some of them. Adding each index takes a brief write lock on the
 * table; none of these tables is large enough for that to be a concern here.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_Sessions_refreshTokenHash_key"
        ON "User_Sessions" ("refreshTokenHash");

      CREATE INDEX IF NOT EXISTS "Courses_departmentId_idx"
        ON "Courses" ("departmentId");

      CREATE INDEX IF NOT EXISTS "Students_departmentId_idx"
        ON "Students" ("departmentId");

      CREATE INDEX IF NOT EXISTS "Instructors_departmentId_idx"
        ON "Instructors" ("departmentId");

      CREATE INDEX IF NOT EXISTS "Enrollments_course_semester_status_idx"
        ON "Enrollments" ("courseId", "semesterId", "status");

      CREATE INDEX IF NOT EXISTS "Enrollments_semesterId_idx"
        ON "Enrollments" ("semesterId");

      CREATE INDEX IF NOT EXISTS "Course_Instructors_courseId_idx"
        ON "Course_Instructors" ("courseId");

      CREATE INDEX IF NOT EXISTS "Course_Instructors_instructorId_idx"
        ON "Course_Instructors" ("instructorId");

      CREATE INDEX IF NOT EXISTS "Admin_Operations_createdAt_idx"
        ON "Admin_Operations" ("createdAt" DESC);

      CREATE INDEX IF NOT EXISTS "Admin_Operations_operation_idx"
        ON "Admin_Operations" ("operation");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "Admin_Operations_operation_idx";
      DROP INDEX IF EXISTS "Admin_Operations_createdAt_idx";
      DROP INDEX IF EXISTS "Course_Instructors_instructorId_idx";
      DROP INDEX IF EXISTS "Course_Instructors_courseId_idx";
      DROP INDEX IF EXISTS "Enrollments_semesterId_idx";
      DROP INDEX IF EXISTS "Enrollments_course_semester_status_idx";
      DROP INDEX IF EXISTS "Instructors_departmentId_idx";
      DROP INDEX IF EXISTS "Students_departmentId_idx";
      DROP INDEX IF EXISTS "Courses_departmentId_idx";
      DROP INDEX IF EXISTS "User_Sessions_refreshTokenHash_key";
    `);
  },
};
