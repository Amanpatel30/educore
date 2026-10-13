import "dotenv/config";

import db from "../../models/index.js";

/*
 * Roles, permissions and the grants between them are reference data, not schema,
 * so they live here rather than in a migration. Every insert is guarded by
 * NOT EXISTS instead of ON CONFLICT: provisioned databases had their Roles table
 * created by hand, so their constraint names are not guaranteed to match what
 * Sequelize generates. Re-running this file is always safe.
 */

const ROLES = [
  ["SUPER_ADMIN", "Super administrator"],
  ["ADMIN", "Administrator"],
  ["INSTRUCTOR", "Instructor"],
  ["STUDENT", "Student"],
];

const PERMISSIONS = [
  "ADMIN_CREATE",
  "ADMIN_DISABLE",
  "ROLE_CREATE_UPDATE",
  "PERMISSION_ASSIGN",
  "AUDIT_LOG_VIEW_ALL",
  "SYSTEM_CONFIG_MANAGE",
  "USER_VIEW_ALL",
  "ACADEMIC_DATA_MANAGE_ALL",
  "USER_CREATE_UPDATE_DISABLE",
  "STUDENT_MANAGE",
  "INSTRUCTOR_MANAGE",
  "DEPARTMENT_MANAGE",
  "COURSE_CREATE_UPDATE",
  "SEMESTER_OPEN_CLOSE",
  "ENROLLMENT_CREATE_UPDATE_DROP",
  "AUDIT_LOG_VIEW_ALLOWED",
  "ASSIGNED_COURSE_VIEW",
  "STUDENT_ROSTER_VIEW",
  "GRADE_CREATE_UPDATE",
  "OWN_PROFILE_VIEW_UPDATE",
  "COURSE_CATALOG_VIEW",
  "OWN_ENROLLMENT_CREATE_DROP",
  "OWN_GRADES_VIEW",
  "COURSE_ASSIGN",
  "ENROLLMENT_VIEW_ALL",
  "OWN_ENROLLMENT_VIEW",
];

/*
 * ADMIN includes COURSE_CATALOG_VIEW here. It was missing from this matrix
 * originally, which let an admin create a course and then get a 403 reading it
 * back; migration 20261012120000 fixed the already-provisioned database.
 */
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    "ACADEMIC_DATA_MANAGE_ALL",
    "ADMIN_CREATE",
    "ADMIN_DISABLE",
    "ASSIGNED_COURSE_VIEW",
    "AUDIT_LOG_VIEW_ALL",
    "AUDIT_LOG_VIEW_ALLOWED",
    "COURSE_ASSIGN",
    "COURSE_CATALOG_VIEW",
    "COURSE_CREATE_UPDATE",
    "DEPARTMENT_MANAGE",
    "ENROLLMENT_CREATE_UPDATE_DROP",
    "ENROLLMENT_VIEW_ALL",
    "GRADE_CREATE_UPDATE",
    "INSTRUCTOR_MANAGE",
    "OWN_ENROLLMENT_CREATE_DROP",
    "OWN_GRADES_VIEW",
    "OWN_PROFILE_VIEW_UPDATE",
    "PERMISSION_ASSIGN",
    "ROLE_CREATE_UPDATE",
    "SEMESTER_OPEN_CLOSE",
    "STUDENT_MANAGE",
    "STUDENT_ROSTER_VIEW",
    "SYSTEM_CONFIG_MANAGE",
    "USER_CREATE_UPDATE_DISABLE",
    "USER_VIEW_ALL",
  ],
  ADMIN: [
    "AUDIT_LOG_VIEW_ALLOWED",
    "COURSE_ASSIGN",
    "COURSE_CATALOG_VIEW",
    "COURSE_CREATE_UPDATE",
    "DEPARTMENT_MANAGE",
    "ENROLLMENT_CREATE_UPDATE_DROP",
    "ENROLLMENT_VIEW_ALL",
    "INSTRUCTOR_MANAGE",
    "SEMESTER_OPEN_CLOSE",
    "STUDENT_MANAGE",
    "USER_CREATE_UPDATE_DISABLE",
    "USER_VIEW_ALL",
  ],
  INSTRUCTOR: [
    "ASSIGNED_COURSE_VIEW",
    "GRADE_CREATE_UPDATE",
    "STUDENT_ROSTER_VIEW",
  ],
  STUDENT: [
    "COURSE_CATALOG_VIEW",
    "OWN_ENROLLMENT_CREATE_DROP",
    "OWN_ENROLLMENT_VIEW",
    "OWN_GRADES_VIEW",
    "OWN_PROFILE_VIEW_UPDATE",
  ],
};

// Catches a typo in the constants above before it becomes a silent no-op.
const grants = () => {
  const known = new Set(ROLES.map(([name]) => name));

  return Object.entries(ROLE_PERMISSIONS).flatMap(([role, names]) => {
    if (!known.has(role)) {
      throw new Error(`ROLE_PERMISSIONS references unknown role "${role}".`);
    }

    return names.map((permission) => {
      if (!PERMISSIONS.includes(permission)) {
        throw new Error(`ROLE_PERMISSIONS references unknown permission "${permission}".`);
      }

      return [role, permission];
    });
  });
};

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const tuples = (rows) =>
  rows.map((row) => `(${row.map(quote).join(", ")})`).join(", ");

const bootstrapRbac = async (sequelize) => {
  const query = (sql) => sequelize.query(sql);

  await query(`
    INSERT INTO "Roles" ("name", "description", "createdAt", "updatedAt")
    SELECT v.name, v.description, NOW(), NOW()
    FROM (VALUES ${tuples(ROLES)}) AS v(name, description)
    WHERE NOT EXISTS (SELECT 1 FROM "Roles" r WHERE r."name" = v.name);
  `);

  await query(`
    INSERT INTO "Permissions" ("name", "description", "createdAt", "updatedAt")
    SELECT v.name, NULL, NOW(), NOW()
    FROM (VALUES ${tuples(PERMISSIONS.map((name) => [name]))}) AS v(name)
    WHERE NOT EXISTS (SELECT 1 FROM "Permissions" p WHERE p."name" = v.name);
  `);

  await query(`
    INSERT INTO "Role_Permissions" ("roleId", "permissionId")
    SELECT r."id", p."id"
    FROM (VALUES ${tuples(grants())}) AS m(role, permission)
    JOIN "Roles" r ON r."name" = m.role
    JOIN "Permissions" p ON p."name" = m.permission
    WHERE NOT EXISTS (
      SELECT 1 FROM "Role_Permissions" rp
      WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
    );
  `);

  const [counts] = await query(`
    SELECT r."name" AS role, COUNT(rp."permissionId")::int AS permissions
    FROM "Roles" r
    LEFT JOIN "Role_Permissions" rp ON rp."roleId" = r."id"
    GROUP BY r."name"
    ORDER BY r."name";
  `);

  const actual = Object.fromEntries(counts.map((c) => [c.role, c.permissions]));

  for (const [role, names] of Object.entries(ROLE_PERMISSIONS)) {
    const expected = names.length;

    // Fewer grants than the matrix means the insert did not apply.
    if (actual[role] < expected) {
      throw new Error(
        `Role "${role}" ended up with ${actual[role]} permissions, expected ${expected}.`
      );
    }

    // More means grants exist that this file does not manage; it never removes.
    if (actual[role] > expected) {
      console.warn(
        `Warning: role "${role}" has ${actual[role]} permissions but this file ` +
          `grants ${expected}. Extra grants are left untouched.`
      );
    }
  }

  return actual;
};

const main = async () => {
  try {
    await db.sequelize.authenticate();

    const counts = await bootstrapRbac(db.sequelize);

    console.log("RBAC bootstrap complete:");
    for (const [role, count] of Object.entries(counts)) {
      console.log(`  ${role}: ${count} permissions`);
    }
  } catch (error) {
    console.error("RBAC bootstrap failed:", error.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
};

main();
