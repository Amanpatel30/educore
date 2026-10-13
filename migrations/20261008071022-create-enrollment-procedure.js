'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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

        /*
         * 1. Check student
         */
        IF NOT EXISTS (
          SELECT 1
          FROM "Students"
          WHERE "id" = p_student_id
        ) THEN
          RAISE EXCEPTION 'Student not found';
        END IF;

        /*
         * 2. Check student is ACTIVE
         */
        IF NOT EXISTS (
          SELECT 1
          FROM "Students"
          WHERE "id" = p_student_id
            AND "status" = 'ACTIVE'
        ) THEN
          RAISE EXCEPTION 'Student is not active';
        END IF;

        /*
         * 3. Check course
         */
        IF NOT EXISTS (
          SELECT 1
          FROM "Courses"
          WHERE "id" = p_course_id
        ) THEN
          RAISE EXCEPTION 'Course not found';
        END IF;

        /*
         * 4. Check course is ACTIVE
         */
        IF NOT EXISTS (
          SELECT 1
          FROM "Courses"
          WHERE "id" = p_course_id
            AND "isActive" = true
        ) THEN
          RAISE EXCEPTION 'Course is not active';
        END IF;

        /*
         * 5. Check semester
         */
        IF NOT EXISTS (
          SELECT 1
          FROM "Semesters"
          WHERE "id" = p_semester_id
        ) THEN
          RAISE EXCEPTION 'Semester not found';
        END IF;

        /*
         * 6. Check semester is OPEN
         */
        IF NOT EXISTS (
          SELECT 1
          FROM "Semesters"
          WHERE "id" = p_semester_id
            AND "status" = 'OPEN'
        ) THEN
          RAISE EXCEPTION 'Semester is not open';
        END IF;

        /*
         * 7. Check duplicate enrollment
         */
        IF EXISTS (
          SELECT 1
          FROM "Enrollments"
          WHERE "studentId" = p_student_id
            AND "courseId" = p_course_id
            AND "semesterId" = p_semester_id
        ) THEN
          RAISE EXCEPTION 'Student is already enrolled in this course for this semester';
        END IF;

        /*
         * 8. Lock the course row
         *
         * This prevents two concurrent enrollment requests
         * from both seeing the same available seat.
         */
        SELECT "capacity"
        INTO v_course_capacity
        FROM "Courses"
        WHERE "id" = p_course_id
        FOR UPDATE;

        /*
         * 9. Count ACTIVE enrollments
         */
        SELECT COUNT(*)
        INTO v_current_enrollments
        FROM "Enrollments"
        WHERE "courseId" = p_course_id
          AND "semesterId" = p_semester_id
          AND "status" = 'ACTIVE';

        /*
         * 10. Check capacity
         */
        IF v_current_enrollments >= v_course_capacity THEN
          RAISE EXCEPTION 'Course capacity is full';
        END IF;

        /*
         * 11. Create enrollment
         */
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

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP PROCEDURE IF EXISTS public.create_enrollment(BIGINT, BIGINT, BIGINT);
    `);
  }
};
