'use strict';

/*
 * Re-enrolling after a drop.
 *
 * Approved business decision (2026-10-12): a student may re-enroll in the same
 * course and semester after dropping it, as long as the semester is still OPEN.
 *
 * The unique index on (studentId, courseId, semesterId) keeps the dropped row,
 * so "enroll again" cannot be an INSERT. The procedure now reactivates the
 * existing row instead, after the same capacity check a fresh enrollment gets.
 *
 * Ordering note: the course row is locked before the existing-enrollment lookup
 * so two concurrent requests cannot both see a dropped row and both reactivate.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE PROCEDURE public.create_enrollment(
        p_student_id BIGINT,
        p_course_id BIGINT,
        p_semester_id BIGINT,
        OUT p_enrollment_id BIGINT
      )
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_course_capacity INTEGER;
        v_current_enrollments INTEGER;
        v_existing_id BIGINT;
        v_existing_status TEXT;
      BEGIN

        -- 1. Student must exist
        IF NOT EXISTS (
          SELECT 1 FROM "Students" WHERE "id" = p_student_id
        ) THEN
          RAISE EXCEPTION 'Student not found';
        END IF;

        -- 2. Student must be ACTIVE
        IF NOT EXISTS (
          SELECT 1 FROM "Students"
          WHERE "id" = p_student_id AND "status" = 'ACTIVE'
        ) THEN
          RAISE EXCEPTION 'Student is not active';
        END IF;

        -- 3. Course must exist
        IF NOT EXISTS (
          SELECT 1 FROM "Courses" WHERE "id" = p_course_id
        ) THEN
          RAISE EXCEPTION 'Course not found';
        END IF;

        -- 4. Course must be ACTIVE
        IF NOT EXISTS (
          SELECT 1 FROM "Courses"
          WHERE "id" = p_course_id AND "isActive" = true
        ) THEN
          RAISE EXCEPTION 'Course is not active';
        END IF;

        -- 5. Semester must exist
        IF NOT EXISTS (
          SELECT 1 FROM "Semesters" WHERE "id" = p_semester_id
        ) THEN
          RAISE EXCEPTION 'Semester not found';
        END IF;

        -- 6. Semester must be OPEN
        IF NOT EXISTS (
          SELECT 1 FROM "Semesters"
          WHERE "id" = p_semester_id AND "status" = 'OPEN'
        ) THEN
          RAISE EXCEPTION 'Semester is not open';
        END IF;

        /*
         * 7. Lock the course row.
         *
         * Held until the surrounding transaction ends, so two concurrent
         * requests cannot both observe the same free seat.
         */
        SELECT "capacity"
        INTO v_course_capacity
        FROM "Courses"
        WHERE "id" = p_course_id
        FOR UPDATE;

        -- 8. Is there already a row for this student, course and semester?
        SELECT "id", "status"
        INTO v_existing_id, v_existing_status
        FROM "Enrollments"
        WHERE "studentId" = p_student_id
          AND "courseId" = p_course_id
          AND "semesterId" = p_semester_id;

        IF v_existing_id IS NOT NULL AND v_existing_status = 'ACTIVE' THEN
          RAISE EXCEPTION 'Student is already enrolled in this course for this semester';
        END IF;

        -- 9. Count ACTIVE enrollments. A dropped row does not hold a seat.
        SELECT COUNT(*)
        INTO v_current_enrollments
        FROM "Enrollments"
        WHERE "courseId" = p_course_id
          AND "semesterId" = p_semester_id
          AND "status" = 'ACTIVE';

        -- 10. Capacity
        IF v_current_enrollments >= v_course_capacity THEN
          RAISE EXCEPTION 'Course capacity is full';
        END IF;

        IF v_existing_id IS NOT NULL THEN
          /*
           * 11a. Reactivate the dropped enrollment. The seat is taken as of
           * today, so enrollmentDate moves to the current date and droppedAt is
           * cleared — an ACTIVE row carrying a droppedAt would contradict
           * itself. grade is left untouched: no endpoint writes it, and clearing
           * it here would destroy a value this procedure did not set.
           */
          UPDATE "Enrollments"
          SET "status" = 'ACTIVE',
              "enrollmentDate" = CURRENT_DATE,
              "droppedAt" = NULL,
              "updatedAt" = NOW()
          WHERE "id" = v_existing_id
          RETURNING "id" INTO p_enrollment_id;
        ELSE
          -- 11b. Fresh enrollment
          INSERT INTO "Enrollments" (
            "studentId",
            "courseId",
            "semesterId",
            "enrollmentDate",
            "status",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            p_student_id,
            p_course_id,
            p_semester_id,
            CURRENT_DATE,
            'ACTIVE',
            NOW(),
            NOW()
          )
          RETURNING "id"
          INTO p_enrollment_id;
        END IF;

      END;
      $$;
    `);
  },

  /*
   * Restores the previous definition: any existing row blocks enrollment,
   * dropped or not, and no reactivation path exists. Deployments that already
   * reactivated rows keep them — status is data, not schema.
   */
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE PROCEDURE public.create_enrollment(
        p_student_id BIGINT,
        p_course_id BIGINT,
        p_semester_id BIGINT,
        OUT p_enrollment_id BIGINT
      )
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_course_capacity INTEGER;
        v_current_enrollments INTEGER;
      BEGIN

        IF NOT EXISTS (
          SELECT 1 FROM "Students" WHERE "id" = p_student_id
        ) THEN
          RAISE EXCEPTION 'Student not found';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM "Students"
          WHERE "id" = p_student_id AND "status" = 'ACTIVE'
        ) THEN
          RAISE EXCEPTION 'Student is not active';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM "Courses" WHERE "id" = p_course_id
        ) THEN
          RAISE EXCEPTION 'Course not found';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM "Courses"
          WHERE "id" = p_course_id AND "isActive" = true
        ) THEN
          RAISE EXCEPTION 'Course is not active';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM "Semesters" WHERE "id" = p_semester_id
        ) THEN
          RAISE EXCEPTION 'Semester not found';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM "Semesters"
          WHERE "id" = p_semester_id AND "status" = 'OPEN'
        ) THEN
          RAISE EXCEPTION 'Semester is not open';
        END IF;

        IF EXISTS (
          SELECT 1 FROM "Enrollments"
          WHERE "studentId" = p_student_id
            AND "courseId" = p_course_id
            AND "semesterId" = p_semester_id
        ) THEN
          RAISE EXCEPTION 'Student is already enrolled in this course for this semester';
        END IF;

        SELECT "capacity"
        INTO v_course_capacity
        FROM "Courses"
        WHERE "id" = p_course_id
        FOR UPDATE;

        SELECT COUNT(*)
        INTO v_current_enrollments
        FROM "Enrollments"
        WHERE "courseId" = p_course_id
          AND "semesterId" = p_semester_id
          AND "status" = 'ACTIVE';

        IF v_current_enrollments >= v_course_capacity THEN
          RAISE EXCEPTION 'Course capacity is full';
        END IF;

        INSERT INTO "Enrollments" (
          "studentId",
          "courseId",
          "semesterId",
          "enrollmentDate",
          "status",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          p_student_id,
          p_course_id,
          p_semester_id,
          CURRENT_DATE,
          'ACTIVE',
          NOW(),
          NOW()
        )
        RETURNING "id"
        INTO p_enrollment_id;

      END;
      $$;
    `);
  },
};
