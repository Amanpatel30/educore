import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";

const {
  Enrollment,
  sequelize,
} = db;

export const createEnrollment = async (data, actorId = null) => {
  const {
    studentId,
    courseId,
    semesterId,
  } = data;

  /*
   * Basic request validation
   *
   * These are still checked in Node because this is
   * application-level input validation.
   */
  if (!studentId || !courseId || !semesterId) {
    throw new AppError(
      "studentId, courseId and semesterId are required",
      400
    );
  }

  try {
    /*
     * Start PostgreSQL transaction.
     *
     * The transaction stays active while the stored procedure
     * runs. Therefore, the FOR UPDATE lock inside the procedure
     * remains held until this transaction finishes.
     */
    const enrollment = await sequelize.transaction(
      async (transaction) => {
        /*
         * Call PostgreSQL stored procedure.
         *
         * The last NULL corresponds to the OUT parameter
         * p_enrollment_id.
         */
        const [result] = await sequelize.query(
          `
            CALL public.create_enrollment(
              :studentId,
              :courseId,
              :semesterId,
              NULL
            )
          `,
          {
            replacements: {
              studentId,
              courseId,
              semesterId,
            },
            transaction,
          }
        );

        /*
         * PostgreSQL returns the newly created enrollment ID.
         */
        const enrollmentId =
          result?.[0]?.p_enrollment_id;

        if (!enrollmentId) {
          throw new AppError(
            "Enrollment was not created",
            500
          );
        }

        /*
         * Fetch the newly created enrollment using Sequelize.
         *
         * We keep this inside the same transaction.
         */
        const createdEnrollment =
          await Enrollment.findByPk(
            enrollmentId,
            {
              transaction,
            }
          );

        if (!createdEnrollment) {
          throw new AppError(
            "Enrollment was created but could not be retrieved",
            500
          );
        }

        if (actorId) {
          await recordAdminOperation(
            {
              adminUserId: actorId,
              operation: "CREATE_ENROLLMENT",
              targetType: "Enrollment",
              targetId: createdEnrollment.id,
            },
            transaction
          );
        }

        return createdEnrollment;
      }
    );

    /*
     * sequelize.transaction(callback) automatically commits
     * when the callback succeeds.
     *
     * It automatically rolls back when the callback throws.
     */
    return enrollment;
  } catch (error) {
    /*
     * PostgreSQL RAISE EXCEPTION errors arrive through Sequelize.
     * Convert known database errors into your normal AppError
     * responses.
     */

    const databaseMessage =
      error?.original?.message ||
      error?.parent?.message ||
      error?.message ||
      "";

    if (
      databaseMessage.includes(
        "Student not found"
      )
    ) {
      throw new AppError(
        "Student not found",
        404
      );
    }

    if (
      databaseMessage.includes(
        "Student is not active"
      )
    ) {
      throw new AppError(
        "Student is not active",
        400
      );
    }

    if (
      databaseMessage.includes(
        "Course not found"
      )
    ) {
      throw new AppError(
        "Course not found",
        404
      );
    }

    if (
      databaseMessage.includes(
        "Course is not active"
      )
    ) {
      throw new AppError(
        "Course is not active",
        400
      );
    }

    if (
      databaseMessage.includes(
        "Semester not found"
      )
    ) {
      throw new AppError(
        "Semester not found",
        404
      );
    }

    if (
      databaseMessage.includes(
        "Semester is not open"
      )
    ) {
      throw new AppError(
        "Enrollment is only allowed in an open semester",
        400
      );
    }

    if (
      databaseMessage.includes(
        "Student is already enrolled"
      )
    ) {
      throw new AppError(
        "Student is already enrolled in this course for this semester",
        409
      );
    }

    if (
      databaseMessage.includes(
        "Course capacity is full"
      )
    ) {
      throw new AppError(
        "Course capacity is full",
        409
      );
    }

    /*
     * PostgreSQL unique constraint violation.
     *
     * This is an additional safety net for concurrent
     * duplicate enrollment attempts.
     */
    if (
      error?.original?.code === "23505" ||
      error?.parent?.code === "23505"
    ) {
      throw new AppError(
        "Student is already enrolled in this course for this semester",
        409
      );
    }

    /*
     * Preserve existing AppError objects.
     */
    if (error instanceof AppError) {
      throw error;
    }

    /*
     * Unknown database/application error.
     */
    throw error;
  }
};