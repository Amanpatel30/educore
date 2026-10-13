import { hashPassword } from "../../src/utils/password.js";

export const PASSWORD = "Test@123";

export const EMAILS = {
  superAdmin: "superadmin@test.local",
  admin: "admin@test.local",
  instructor: "instructor@test.local",
  student: "student@test.local",
  student2: "student2@test.local",
  inactiveStudent: "inactive.student@test.local",
};

/*
 * Roles, permissions and their grants are not seeded here. They are reference
 * data owned by src/scripts/bootstrapRbac.js, which the harness runs against the
 * test database before calling this file — the same sequence deployment uses.
 * This file only creates domain data.
 */

export const seed = async (sequelize) => {
  const query = (sql) => sequelize.query(sql);

  const insertUsers = async (rows) => {
    const values = rows
      .map(
        (row) =>
          `('${row.name}', '${row.email}', '${row.passwordHash}', ` +
          `${row.roleId}, '${row.status}', NOW(), NOW())`
      )
      .join(",");

    const [result] = await query(`
      INSERT INTO "Users"
        ("name", "email", "passwordHash", "roleId", "status", "createdAt", "updatedAt")
      VALUES ${values}
      RETURNING "id", "email";
    `);

    return result;
  };

  const [roles] = await query(`SELECT "id", "name" FROM "Roles";`);

  const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  for (const name of ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "STUDENT"]) {
    if (!roleId[name]) {
      throw new Error(
        `Role "${name}" is missing from the test database. Run the RBAC ` +
          `bootstrap (npm run bootstrap) before seeding.`
      );
    }
  }

  const [departments] = await query(`
    INSERT INTO "Departments" ("name", "code", "description", "isActive", "createdAt", "updatedAt")
    VALUES ('Computer Science', 'CSE', NULL, true, NOW(), NOW())
    RETURNING "id", "code";
  `);

  const cse = departments.find((d) => d.code === "CSE").id;

  const passwordHash = await hashPassword(PASSWORD);

  const users = await insertUsers([
    {
      name: "Super Admin",
      email: EMAILS.superAdmin,
      passwordHash,
      roleId: roleId.SUPER_ADMIN,
      status: "ACTIVE",
    },
    {
      name: "Admin User",
      email: EMAILS.admin,
      passwordHash,
      roleId: roleId.ADMIN,
      status: "ACTIVE",
    },
    {
      name: "Instructor User",
      email: EMAILS.instructor,
      passwordHash,
      roleId: roleId.INSTRUCTOR,
      status: "ACTIVE",
    },
    {
      name: "Student One",
      email: EMAILS.student,
      passwordHash,
      roleId: roleId.STUDENT,
      status: "ACTIVE",
    },
    {
      name: "Student Two",
      email: EMAILS.student2,
      passwordHash,
      roleId: roleId.STUDENT,
      status: "ACTIVE",
    },
    {
      name: "Inactive Student",
      email: EMAILS.inactiveStudent,
      passwordHash,
      roleId: roleId.STUDENT,
      status: "INACTIVE",
    },
  ]);

  const userId = Object.fromEntries(users.map((u) => [u.email, u.id]));

  const [students] = await query(`
    INSERT INTO "Students"
      ("userId", "departmentId", "studentCode", "admissionDate", "status", "createdAt", "updatedAt")
    VALUES
      (${userId[EMAILS.student]}, ${cse}, 'STU001', '2026-01-01', 'ACTIVE', NOW(), NOW()),
      (${userId[EMAILS.student2]}, ${cse}, 'STU002', '2026-01-01', 'ACTIVE', NOW(), NOW()),
      (${userId[EMAILS.inactiveStudent]}, ${cse}, 'STU003', '2026-01-01', 'INACTIVE', NOW(), NOW())
    RETURNING "id", "studentCode";
  `);

  const studentId = Object.fromEntries(
    students.map((s) => [s.studentCode, s.id])
  );

  const [instructors] = await query(`
    INSERT INTO "Instructors"
      ("userId", "departmentId", "employeeCode", "designation", "status", "createdAt", "updatedAt")
    VALUES
      (${userId[EMAILS.instructor]}, ${cse}, 'EMP001', 'Assistant Professor', 'ACTIVE', NOW(), NOW())
    RETURNING "id", "employeeCode";
  `);

  const instructorId = instructors[0].id;

  const [semesters] = await query(`
    INSERT INTO "Semesters"
      ("name", "academicYear", "startDate", "endDate", "status", "createdAt", "updatedAt")
    VALUES
      ('Fall', '2026', '2026-08-01', '2026-12-20', 'OPEN', NOW(), NOW()),
      ('Spring', '2026', '2026-01-05', '2026-05-20', 'CLOSED', NOW(), NOW()),
      ('Summer', '2026', '2026-05-25', '2026-07-30', 'UPCOMING', NOW(), NOW())
    RETURNING "id", "name";
  `);

  const semesterId = Object.fromEntries(semesters.map((s) => [s.name, s.id]));

  const [courses] = await query(`
    INSERT INTO "Courses"
      ("departmentId", "code", "name", "credits", "capacity", "isActive", "createdAt", "updatedAt")
    VALUES
      (${cse}, 'CSE101', 'Intro to Programming', 3, 100, true, NOW(), NOW()),
      (${cse}, 'CSE201', 'Data Structures', 4, 100, true, NOW(), NOW()),
      (${cse}, 'CSE301', 'Algorithms', 4, 1, true, NOW(), NOW()),
      (${cse}, 'CSE999', 'Retired Course', 1, 10, false, NOW(), NOW())
    RETURNING "id", "code";
  `);

  const courseId = Object.fromEntries(courses.map((c) => [c.code, c.id]));

  return {
    departmentId: cse,
    userId,
    studentId,
    instructorId,
    semesterId,
    courseId,
  };
};
