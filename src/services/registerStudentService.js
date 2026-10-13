import { UniqueConstraintError, ValidationError } from "sequelize";
import db from "../../models/index.js";
import { AppError } from "../utils/AppError.js";
import { hashPassword } from "../utils/password.js";
import { requireId, requireText } from "../utils/validate.js";
import { toPublicUser } from "./user/toPublicUser.js";

const { User, Role, Student, Department, sequelize } = db;

const MIN_PASSWORD_LENGTH = 8;

// bcrypt silently ignores everything past 72 bytes, so a longer password would
// be accepted at face value while only its prefix is what actually protects
// the account.
const MAX_PASSWORD_LENGTH = 72;

const MAX_NAME_LENGTH = 255;

const MAX_EMAIL_LENGTH = 255;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * A caller must not believe it set any of these. Silently ignoring them would
 * be worse than refusing: the client would go on reporting a role or status
 * that the database never received.
 */
const UNACCEPTED_FIELDS = [
  "role",
  "roleId",
  "status",
  "isActive",
  "studentCode",
  "admissionDate",
  "passwordHash",
  "permissions",
];

const assertNothingPrivileged = (body) => {
  const sent = UNACCEPTED_FIELDS.find((field) => body[field] !== undefined);

  if (sent) {
    throw new AppError(`${sent} is not accepted by this endpoint`, 400);
  }
};

const readEmail = (value) => {
  const email = requireText(value, "email").trim().toLowerCase();

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new AppError("email must be a valid email address", 400);
  }

  return email;
};

const readPassword = (value) => {
  const password = requireText(value, "password");

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      400
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(
      `password must be at most ${MAX_PASSWORD_LENGTH} characters`,
      400
    );
  }

  return password;
};

const readName = (value) => {
  const name = requireText(value, "name");

  if (name.length > MAX_NAME_LENGTH) {
    throw new AppError(`name must be at most ${MAX_NAME_LENGTH} characters`, 400);
  }

  return name;
};

const loadDepartment = async (id, transaction) => {
  const department = await Department.findByPk(id, { transaction });

  if (!department) {
    throw new AppError("Department not found", 404);
  }

  if (!department.isActive) {
    throw new AppError("Department is not open for registration", 400);
  }

  return department;
};

/*
 * The role is looked up by name and never taken from the request, so no request
 * shape can produce an ADMIN, SUPER_ADMIN or INSTRUCTOR here.
 */
const loadStudentRole = async (transaction) => {
  const role = await Role.findOne({
    where: { name: "STUDENT" },
    transaction,
  });

  if (!role) {
    throw new Error("STUDENT role is not provisioned");
  }

  return role;
};

/*
 * Derived from the primary key, which is unique and already assigned, so the
 * code cannot collide and no retry loop is needed.
 */
const studentCodeFor = (userId) => `STU${String(userId).padStart(5, "0")}`;

const asConflict = (error) => {
  if (error instanceof UniqueConstraintError) {
    const fields = Object.keys(error.fields || {});

    // studentCode is derived from the user id, so email is the only other
    // unique column this insert can collide on.
    return new AppError(
      fields.some((field) => field.toLowerCase() === "email")
        ? "Email is already registered"
        : "Registration could not be completed",
      409
    );
  }

  if (error instanceof ValidationError) {
    return new AppError("Submitted details are not valid", 400);
  }

  return error;
};

export const registerStudent = async (body) => {
  assertNothingPrivileged(body);

  const name = readName(body.name);
  const email = readEmail(body.email);
  const password = readPassword(body.password);
  const departmentId = requireId(body.departmentId, "departmentId");

  try {
    return await sequelize.transaction(async (transaction) => {
      /*
       * No pre-check for a duplicate email: it would not stop two concurrent
       * requests from both passing it, so the unique constraint is the only
       * real guard and is what answers here as well.
       */
      const role = await loadStudentRole(transaction);

      await loadDepartment(departmentId, transaction);

      const user = await User.create(
        {
          name,
          email,
          passwordHash: await hashPassword(password),
          roleId: role.id,
          status: "ACTIVE",
        },
        { transaction }
      );

      await Student.create(
        {
          userId: user.id,
          departmentId,
          studentCode: studentCodeFor(user.id),
          admissionDate: new Date().toISOString().slice(0, 10),
          status: "ACTIVE",
        },
        { transaction }
      );

      return toPublicUser({
        ...user.get({ plain: true }),
        roleDetails: role,
      });
    });
  } catch (error) {
    throw asConflict(error);
  }
};
