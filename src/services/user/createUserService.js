import db from "../../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { hashPassword } from "../../utils/password.js";
import { requireDate, requireId, requireText } from "../../utils/validate.js";
import { recordAdminOperation } from "../audit/recordAdminOperationService.js";
import { toPublicUser } from "./toPublicUser.js";
import {
  assertRoleAssignable,
  loadActor,
} from "./userAdminRules.js";

const { User, Role, Student, Instructor, Department, sequelize } = db;

const MIN_PASSWORD_LENGTH = 8;

const findRole = async (name, transaction) => {
  const role = await Role.findOne({ where: { name }, transaction });

  if (!role) {
    throw new AppError(`Unknown role: ${name}`, 400);
  }

  return role;
};

const assertDepartmentExists = async (id, transaction) => {
  const department = await Department.findByPk(id, { transaction });

  if (!department) {
    throw new AppError("Department not found", 404);
  }
};

/*
 * The email column is unique and the profile code columns are unique, so the
 * same input would otherwise surface as a raw driver error.
 */
const assertFree = async (model, field, value, message, transaction) => {
  const taken = await model.count({
    where: { [field]: value },
    transaction,
  });

  if (taken > 0) {
    throw new AppError(message, 409);
  }
};

const createProfile = async (roleName, body, userId, transaction) => {
  if (roleName === "STUDENT") {
    const input = body.student || {};

    const student = {
      userId,
      departmentId: requireId(input.departmentId, "student.departmentId"),
      studentCode: requireText(input.studentCode, "student.studentCode"),
      admissionDate: requireDate(
        input.admissionDate,
        "student.admissionDate"
      ),
      status: "ACTIVE",
    };

    await assertDepartmentExists(student.departmentId, transaction);
    await assertFree(
      Student,
      "studentCode",
      student.studentCode,
      "studentCode is already in use",
      transaction
    );

    return Student.create(student, { transaction });
  }

  if (roleName === "INSTRUCTOR") {
    const input = body.instructor || {};

    const instructor = {
      userId,
      departmentId: requireId(
        input.departmentId,
        "instructor.departmentId"
      ),
      employeeCode: requireText(
        input.employeeCode,
        "instructor.employeeCode"
      ),
      designation: requireText(
        input.designation,
        "instructor.designation"
      ),
      status: "ACTIVE",
    };

    await assertDepartmentExists(instructor.departmentId, transaction);
    await assertFree(
      Instructor,
      "employeeCode",
      instructor.employeeCode,
      "employeeCode is already in use",
      transaction
    );

    return Instructor.create(instructor, { transaction });
  }

  return null;
};

export const createUser = async ({ actorId, body }) => {
  const name = requireText(body.name, "name");
  // Lower-cased the way login lower-cases it, or the account could never sign in.
  const email = requireText(body.email, "email").toLowerCase();
  const password = requireText(body.password, "password");
  const roleName = requireText(body.role, "role");

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      400
    );
  }

  return sequelize.transaction(async (transaction) => {
    const actor = await loadActor(actorId, transaction);

    assertRoleAssignable(actor.roleName, roleName);

    const role = await findRole(roleName, transaction);

    await assertFree(
      User,
      "email",
      email,
      "Email is already registered",
      transaction
    );

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

    await createProfile(roleName, body, user.id, transaction);

    await recordAdminOperation(
      {
        adminUserId: actor.id,
        operation: "CREATE_USER",
        targetType: "User",
        targetId: user.id,
      },
      transaction
    );

    return toPublicUser({ ...user.get({ plain: true }), roleDetails: role });
  });
};
