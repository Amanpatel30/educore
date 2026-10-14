import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import { resetRateLimits } from "../src/middleware/rateLimit.js";

import {
  bootstrap,
  createTestDatabase,
  dropTestDatabase,
  migrate,
} from "./helpers/database.js";
import { EMAILS, PASSWORD, seed } from "./helpers/fixtures.js";
import { createClient } from "./helpers/client.js";

/*
 * The database must exist, be migrated and have its reference data bootstrapped
 * before the application modules are imported, because models/index.js reads
 * DATABASE_URL at import time. This is the exact sequence deployment runs.
 */
const database = await createTestDatabase();
process.env.DATABASE_URL = database.url;

migrate(database.url);
bootstrap(database.url);

const { default: db } = await import("../models/index.js");
const { default: app } = await import("../src/app.js");

const fixtures = await seed(db.sequelize);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));

const baseUrl = `http://127.0.0.1:${server.address().port}`;

const anon = createClient(baseUrl);
const superAdmin = createClient(baseUrl);
const admin = createClient(baseUrl);
const instructor = createClient(baseUrl);
const student = createClient(baseUrl);
const student2 = createClient(baseUrl);

/*
 * Each sign-in returns the tab context the server generated for that session.
 * A real tab keeps it in sessionStorage and sends it back on refresh and
 * logout, so the test clients remember it per client the same way.
 */
const tabContexts = new Map();

const login = async (client, email) => {
  const res = await client.post("/api/auth/login", {
    body: { email, password: PASSWORD },
  });

  assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`);

  tabContexts.set(client, res.body.tabContext);
  client.setToken(res.body.accessToken);

  return res.body.accessToken;
};

const refreshTab = (client, tabContext = tabContexts.get(client)) =>
  client.post("/api/auth/refresh", {
    headers: { "X-Tab-Context": tabContext },
  });

const logoutTab = (client, tabContext = tabContexts.get(client)) =>
  client.post("/api/auth/logout", {
    headers: { "X-Tab-Context": tabContext },
  });

const cookieNameFor = (tabContext) => `refresh_${tabContext}`;

const tokens = {
  superAdmin: await login(superAdmin, EMAILS.superAdmin),
  admin: await login(admin, EMAILS.admin),
  instructor: await login(instructor, EMAILS.instructor),
  student: await login(student, EMAILS.student),
  student2: await login(student2, EMAILS.student2),
};

// Filled in by the enrollment tests and reused by later ones.
const state = {};

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.sequelize.close();
  await dropTestDatabase(database.name);
});

const rbacSnapshot = async () => {
  const [rows] = await db.sequelize.query(`
    SELECT
      (SELECT COUNT(*)::int FROM "Roles") AS roles,
      (SELECT COUNT(*)::int FROM "Permissions") AS permissions,
      (SELECT COUNT(*)::int FROM "Role_Permissions") AS grants;
  `);

  return rows[0];
};

describe("RBAC bootstrap", () => {
  it("converges on a freshly migrated database", async () => {
    const snapshot = await rbacSnapshot();

    assert.equal(snapshot.roles, 4);
    assert.equal(snapshot.permissions, 26);
    assert.equal(snapshot.grants, 45);
  });

  it("is idempotent when run again", async () => {
    const before = await rbacSnapshot();

    bootstrap(database.url);

    assert.deepEqual(await rbacSnapshot(), before);
  });

  it("grants ADMIN every permission its course routes require", async () => {
    const [rows] = await db.sequelize.query(`
      SELECT p."name" AS name
      FROM "Role_Permissions" rp
      JOIN "Roles" r ON r."id" = rp."roleId"
      JOIN "Permissions" p ON p."id" = rp."permissionId"
      WHERE r."name" = 'ADMIN'
      ORDER BY p."name";
    `);

    assert.deepEqual(
      rows.map((row) => row.name),
      [
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
      ]
    );
  });
});

describe("health", () => {
  it("answers without authentication", async () => {
    const res = await anon.get("/health");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
  });
});

describe("CORS", () => {
  it("answers an allowed preflight with credentials headers", async () => {
    const res = await anon.request("OPTIONS", "/api/auth/login", {
      headers: {
        Origin: "http://localhost:3001",
        "Access-Control-Request-Method": "POST",
      },
    });

    assert.equal(res.status, 204);
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      "http://localhost:3001"
    );
    assert.equal(
      res.headers.get("access-control-allow-credentials"),
      "true"
    );
  });

  it("echoes the allowed origin on a real request", async () => {
    const res = await anon.get("/health", {
      headers: { Origin: "http://localhost:3001" },
    });

    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      "http://localhost:3001"
    );
    assert.equal(res.headers.get("vary"), "Origin");
  });

  it("omits the origin header for an unlisted origin", async () => {
    const res = await anon.get("/health", {
      headers: { Origin: "http://evil.example" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});

describe("POST /api/auth/login", () => {
  it("rejects a missing password with 400", async () => {
    const res = await anon.post("/api/auth/login", {
      body: { email: EMAILS.student },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Email and password are required");
  });

  it("rejects an unknown email with 401", async () => {
    const res = await anon.post("/api/auth/login", {
      body: { email: "nobody@test.local", password: PASSWORD },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid email or password");
  });

  it("rejects a wrong password with 401", async () => {
    const res = await anon.post("/api/auth/login", {
      body: { email: EMAILS.student, password: "wrong-password" },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid email or password");
  });

  it("rejects an inactive account with 403", async () => {
    const res = await anon.post("/api/auth/login", {
      body: { email: EMAILS.inactiveStudent, password: PASSWORD },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Account is inactive");
  });

  it("returns an access token and an httpOnly refresh cookie named for the tab", async () => {
    const client = createClient(baseUrl);
    const res = await client.post("/api/auth/login", {
      body: { email: EMAILS.student, password: PASSWORD },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.user.email, EMAILS.student);
    assert.equal(res.body.user.role, "STUDENT");
    assert.equal(res.body.user.status, "ACTIVE");
    assert.equal(res.body.user.passwordHash, undefined);

    // The tab context is what the client sends back; it names the cookie.
    assert.match(
      res.body.tabContext,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    const cookie = res.headers.getSetCookie()[0];
    assert.match(cookie, new RegExp(`^refresh_${res.body.tabContext}=`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\/api\/auth/i);
    // secure is off outside production, so the cookie works over plain http.
    assert.doesNotMatch(cookie, /;\s*Secure/i);

    // The old single-name cookie is gone: nothing reads it any more.
    assert.equal(res.headers.getSetCookie().length, 1);
  });

  it("is case and whitespace insensitive on the email", async () => {
    const client = createClient(baseUrl);
    const res = await client.post("/api/auth/login", {
      body: { email: `  ${EMAILS.student.toUpperCase()}  `, password: PASSWORD },
    });

    assert.equal(res.status, 200);
  });
});

describe("GET /api/users/me", () => {
  it("requires a token", async () => {
    const res = await anon.get("/api/users/me");

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Access token required");
  });

  it("rejects a malformed token", async () => {
    const res = await anon.get("/api/users/me", { token: "not-a-jwt" });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid or expired access token");
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign(
      { sub: "1", roleId: "1" },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "-1s" }
    );

    const res = await anon.get("/api/users/me", { token: expired });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid or expired access token");
  });

  it("returns the enriched profile for every role", async () => {
    const expected = [
      [superAdmin, EMAILS.superAdmin, "SUPER_ADMIN"],
      [admin, EMAILS.admin, "ADMIN"],
      [instructor, EMAILS.instructor, "INSTRUCTOR"],
      [student, EMAILS.student, "STUDENT"],
    ];

    for (const [client, email, role] of expected) {
      const res = await client.get("/api/users/me");

      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, email);
      assert.equal(res.body.user.role, role);
      assert.equal(res.body.user.status, "ACTIVE");
      assert.ok(res.body.user.name);
      assert.equal(res.body.user.passwordHash, undefined);
    }
  });
});

describe("POST /api/auth/refresh", () => {
  it("rejects a request without a tab context", async () => {
    const res = await anon.post("/api/auth/refresh");

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Tab context missing or invalid");
  });

  it("rejects a tab context that is not a UUID", async () => {
    const res = await anon.post("/api/auth/refresh", {
      headers: { "X-Tab-Context": "not-a-uuid" },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Tab context missing or invalid");
  });

  it("rejects a valid context with no matching cookie", async () => {
    const res = await anon.post("/api/auth/refresh", {
      headers: { "X-Tab-Context": "3f1c8e0a-5b2d-4f77-9a10-8c6e2d4b7f31" },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Refresh token missing");
  });

  it("rotates the refresh token and invalidates the previous one", async () => {
    const client = createClient(baseUrl);
    const signedIn = await client.post("/api/auth/login", {
      body: { email: EMAILS.student, password: PASSWORD },
    });

    assert.equal(signedIn.status, 200);

    const context = signedIn.body.tabContext;
    const cookieName = cookieNameFor(context);
    const firstCookie = client.cookies.get(cookieName);

    assert.ok(firstCookie, "login did not set the tab's cookie");
    // The cookie is named for the tab, so two tabs cannot overwrite each other.
    assert.equal(client.cookies.has("refreshToken"), false);

    const refreshed = await refreshTab(client, context);

    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.accessToken);
    assert.equal(refreshed.body.tabContext, context);
    assert.notEqual(client.cookies.get(cookieName), firstCookie);

    // Replaying the original token must now fail, and must clear the cookie.
    const replayClient = createClient(baseUrl);
    replayClient.cookies.set(cookieName, firstCookie);

    const replay = await refreshTab(replayClient, context);

    assert.equal(replay.status, 401);
    assert.equal(replay.body.message, "Invalid or expired refresh token");
    assert.equal(replayClient.cookies.get(cookieName), undefined);

    /*
     * A replayed stale value must cost the replaying client its cookie without
     * costing the real tab its session. Killing the session on reuse is a
     * stronger policy that is not implemented here (see the contract).
     */
    const stillLive = await refreshTab(client, context);

    assert.equal(stillLive.status, 200);
  });

  it("revokes the session on logout", async () => {
    const client = createClient(baseUrl);
    const signedIn = await client.post("/api/auth/login", {
      body: { email: EMAILS.student2, password: PASSWORD },
    });

    const context = signedIn.body.tabContext;
    const cookieName = cookieNameFor(context);
    const cookie = client.cookies.get(cookieName);

    const loggedOut = await logoutTab(client, context);
    assert.equal(loggedOut.status, 200);
    assert.equal(client.cookies.get(cookieName), undefined);

    const after = createClient(baseUrl);
    after.cookies.set(cookieName, cookie);

    const res = await refreshTab(after, context);

    assert.equal(res.status, 401);
  });

  it("stops the logged-out tab's access token without a refresh", async () => {
    const client = createClient(baseUrl);
    const signedIn = await client.post("/api/auth/login", {
      body: { email: EMAILS.student, password: PASSWORD },
    });

    const context = signedIn.body.tabContext;

    client.setToken(signedIn.body.accessToken);

    assert.equal((await client.get("/api/users/me")).status, 200);

    assert.equal((await logoutTab(client, context)).status, 200);

    // The access token has not expired, but its session is gone.
    const afterLogout = await client.get("/api/users/me");

    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.body.message, "Invalid or expired access token");
  });
});

describe("role authorization", () => {
  it("denies an unauthenticated request to a protected route", async () => {
    const res = await anon.get("/api/courses/catalog");

    assert.equal(res.status, 401);
  });

  it("lets a student read the course catalog", async () => {
    const res = await student.get("/api/courses/catalog");

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.courses));
  });

  it("denies an instructor the course catalog", async () => {
    const res = await instructor.get("/api/courses/catalog");

    assert.equal(res.status, 403);
    assert.equal(
      res.body.message,
      "You do not have permission to perform this action"
    );
  });

  it("denies a student course creation", async () => {
    const res = await student.post("/api/courses", {
      body: {
        departmentId: fixtures.departmentId,
        code: "STU-01",
        name: "Should not exist",
        credits: 3,
      },
    });

    assert.equal(res.status, 403);
  });

  it("grants an admin the course catalog", async () => {
    const res = await admin.get("/api/courses/catalog");

    assert.equal(res.status, 200);
  });

  it("denies a student and an instructor the enrollment list", async () => {
    for (const client of [student, instructor]) {
      const res = await client.get("/api/enrollments");

      assert.equal(res.status, 403);
    }
  });

  it("grants an admin and a super admin the enrollment list", async () => {
    for (const client of [admin, superAdmin]) {
      const res = await client.get("/api/enrollments");

      assert.equal(res.status, 200);
    }
  });

  it("denies a student semester management", async () => {
    const res = await student.post("/api/semesters", {
      body: {
        name: "Nope",
        academicYear: "2099",
        startDate: "2099-01-01",
        endDate: "2099-06-01",
      },
    });

    assert.equal(res.status, 403);
  });
});

describe("courses", () => {
  it("returns only active courses in the catalog", async () => {
    const res = await student.get("/api/courses/catalog");

    assert.equal(res.status, 200);

    const codes = res.body.courses.map((c) => c.code);
    assert.ok(!codes.includes("CSE999"));
    assert.ok(codes.includes("CSE101"));
    // Sorted by code ascending.
    assert.deepEqual(codes, [...codes].sort());
  });

  it("does not add pagination metadata when no page is requested", async () => {
    const res = await student.get("/api/courses/catalog");

    assert.equal(res.body.count, res.body.courses.length);
    assert.equal(res.body.total, undefined);
    assert.equal(res.body.page, undefined);
  });

  it("paginates when page and limit are supplied", async () => {
    const first = await student.get("/api/courses/catalog?page=1&limit=1");

    assert.equal(first.status, 200);
    assert.equal(first.body.count, 1);
    assert.equal(first.body.limit, 1);
    assert.equal(first.body.page, 1);
    assert.equal(first.body.total, 3);
    assert.equal(first.body.totalPages, 3);

    const third = await student.get("/api/courses/catalog?page=3&limit=1");

    assert.equal(third.body.count, 1);
    assert.notEqual(third.body.courses[0].code, first.body.courses[0].code);
  });

  it("caps the page size at 100", async () => {
    const res = await student.get("/api/courses/catalog?page=1&limit=5000");

    assert.equal(res.body.limit, 100);
  });

  it("filters the catalog by search text", async () => {
    const byName = await student.get("/api/courses/catalog?search=Algorithms");

    assert.equal(byName.status, 200);
    assert.equal(byName.body.count, 1);
    assert.equal(byName.body.courses[0].code, "CSE301");

    const byCode = await student.get("/api/courses/catalog?search=cse2");

    assert.equal(byCode.body.count, 1);
    assert.equal(byCode.body.courses[0].code, "CSE201");
  });

  it("filters the catalog by department", async () => {
    const res = await student.get(
      `/api/courses/catalog?departmentId=${fixtures.departmentId}`
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 3);
    assert.ok(
      res.body.courses.every(
        (course) =>
          String(course.departmentId) === String(fixtures.departmentId)
      )
    );
  });

  it("sorts the catalog on request", async () => {
    const res = await student.get("/api/courses/catalog?sort=name&order=desc");

    assert.equal(res.status, 200);

    const names = res.body.courses.map((course) => course.name);
    assert.deepEqual(names, [...names].sort().reverse());
  });

  it("rejects unknown catalog filters", async () => {
    const queries = [
      "sort=dropTable",
      "order=sideways",
      "isActive=maybe",
      "departmentId=abc",
    ];

    for (const query of queries) {
      const res = await student.get(`/api/courses/catalog?${query}`);

      assert.equal(res.status, 400, `${query} must be rejected`);
    }
  });

  it("hides retired courses but shows them to an admin on request", async () => {
    const created = await admin.post("/api/courses", {
      body: {
        departmentId: fixtures.departmentId,
        code: "TST900",
        name: "Retired Course",
        credits: 2,
        capacity: 10,
      },
    });

    assert.equal(created.status, 201);
    const id = created.body.course.id;

    assert.equal((await admin.delete(`/api/courses/${id}`)).status, 204);

    const catalog = await student.get("/api/courses/catalog");
    assert.ok(!catalog.body.courses.some((course) => course.id === id));

    // Students cannot ask for retired courses, even with the id in hand.
    const denied = await student.get("/api/courses/catalog?isActive=false");
    assert.equal(denied.status, 403);

    const retired = await admin.get("/api/courses/catalog?isActive=false");
    assert.equal(retired.status, 200);
    assert.ok(retired.body.courses.some((course) => course.id === id));
    assert.ok(retired.body.courses.every((course) => course.isActive === false));

    const all = await admin.get("/api/courses/catalog?isActive=all");
    assert.ok(all.body.courses.some((course) => course.id === id));
    assert.ok(all.body.courses.some((course) => course.isActive === true));

    // Asking for active courses explicitly is still a plain catalog read.
    assert.equal(
      (await student.get("/api/courses/catalog?isActive=true")).status,
      200
    );
  });

  it("rejects a create without required fields", async () => {
    const res = await admin.post("/api/courses", {
      body: { code: "CSE500" },
    });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "departmentId, code, name and credits are required"
    );
  });

  it("rejects an unknown department with 404", async () => {
    const res = await admin.post("/api/courses", {
      body: {
        departmentId: 999999,
        code: "CSE501",
        name: "Ghost Course",
        credits: 3,
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Department not found");
  });

  it("rejects a duplicate code with 409", async () => {
    const res = await admin.post("/api/courses", {
      body: {
        departmentId: fixtures.departmentId,
        code: "CSE101",
        name: "Duplicate",
        credits: 3,
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Course code already exists");
  });

  it("creates, reads, updates and deletes a course", async () => {
    const created = await admin.post("/api/courses", {
      body: {
        departmentId: fixtures.departmentId,
        code: "CSE500",
        name: "Compilers",
        credits: 3,
        capacity: 30,
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.course.code, "CSE500");

    const id = created.body.course.id;

    const read = await admin.get(`/api/courses/${id}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.course.name, "Compilers");
    assert.equal(read.body.course.department.code, "CSE");

    const updated = await admin.put(`/api/courses/${id}`, {
      body: { name: "Compiler Design", capacity: 45 },
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.course.name, "Compiler Design");
    assert.equal(updated.body.course.capacity, 45);
    assert.equal(updated.body.course.code, "CSE500");

    const removed = await admin.delete(`/api/courses/${id}`);
    assert.equal(removed.status, 204);

    // Soft delete: gone from the catalog but still addressable by id.
    const catalog = await admin.get("/api/courses/catalog");
    assert.ok(!catalog.body.courses.some((c) => c.id === id));

    const afterDelete = await admin.get(`/api/courses/${id}`);
    assert.equal(afterDelete.status, 200);
    assert.equal(afterDelete.body.course.isActive, false);
  });

  it("returns 404 for an unknown course", async () => {
    const res = await admin.get("/api/courses/999999");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Course not found");
  });

  it("returns 404 when updating an unknown course", async () => {
    const res = await admin.put("/api/courses/999999", {
      body: { name: "Nope" },
    });

    assert.equal(res.status, 404);
  });
});

describe("semesters", () => {
  it("rejects a request that sends no body at all", async () => {
    // No body and no Content-Type: Express 5 leaves req.body undefined here.
    const res = await admin.post("/api/semesters");

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "name, academicYear, startDate and endDate are required"
    );
  });

  it("rejects an unparseable date", async () => {
    const res = await admin.post("/api/semesters", {
      body: {
        name: "Garbage Dates",
        academicYear: "2027",
        startDate: "not-a-date",
        endDate: "2027-06-01",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "startDate must be a valid date");
  });

  it("rejects an end date before the start date", async () => {
    const res = await admin.post("/api/semesters", {
      body: {
        name: "Backwards",
        academicYear: "2027",
        startDate: "2027-06-01",
        endDate: "2027-01-01",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "startDate must be before endDate");
  });

  it("rejects an unknown status", async () => {
    const res = await admin.post("/api/semesters", {
      body: {
        name: "Weird",
        academicYear: "2027",
        startDate: "2027-01-01",
        endDate: "2027-06-01",
        status: "RUNNING",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "Invalid semester status. Use UPCOMING, OPEN or CLOSED"
    );
  });

  it("rejects a duplicate name for the same academic year", async () => {
    const res = await admin.post("/api/semesters", {
      body: {
        name: "Fall",
        academicYear: "2026",
        startDate: "2026-08-01",
        endDate: "2026-12-20",
      },
    });

    assert.equal(res.status, 409);
  });

  it("creates a semester and reads it back", async () => {
    const created = await admin.post("/api/semesters", {
      body: {
        name: "Winter",
        academicYear: "2027",
        startDate: "2027-01-05",
        endDate: "2027-05-20",
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.semester.status, "UPCOMING");

    state.winterSemesterId = created.body.semester.id;

    const read = await admin.get(`/api/semesters/${state.winterSemesterId}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.semester.name, "Winter");
  });

  it("paginates the semester list", async () => {
    const res = await admin.get("/api/semesters?page=1&limit=2");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.ok(res.body.total >= 4);
    assert.equal(res.body.totalPages, Math.ceil(res.body.total / 2));
  });

  it("filters semesters by status, search, and sorting", async () => {
    const statusRes = await admin.get("/api/semesters?status=OPEN");
    assert.equal(statusRes.status, 200);
    assert.ok(Array.isArray(statusRes.body.semesters));
    for (const sem of statusRes.body.semesters) {
      assert.equal(sem.status, "OPEN");
    }

    const searchRes = await admin.get("/api/semesters?search=Winter");
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.semesters.some((s) => s.name.includes("Winter")));

    const sortRes = await admin.get("/api/semesters?sort=name&order=asc");
    assert.equal(sortRes.status, 200);
    const names = sortRes.body.semesters.map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names, sorted);
  });

  it("returns 404 for an unknown semester", async () => {
    const res = await admin.get("/api/semesters/999999");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Semester not found");
  });

  it("refuses to close an upcoming semester", async () => {
    const res = await admin.patch(`/api/semesters/${state.winterSemesterId}/close`);

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "An upcoming semester cannot be closed");
  });

  it("opens the semester, then refuses a second open", async () => {
    const opened = await admin.patch(`/api/semesters/${state.winterSemesterId}/open`);

    assert.equal(opened.status, 200);
    assert.equal(opened.body.semester.status, "OPEN");

    const again = await admin.patch(`/api/semesters/${state.winterSemesterId}/open`);

    assert.equal(again.status, 409);
    assert.equal(again.body.message, "Semester is already open");
  });

  it("closes an open semester and refuses to reopen it", async () => {
    const closed = await admin.patch(`/api/semesters/${state.winterSemesterId}/close`);

    assert.equal(closed.status, 200);
    assert.equal(closed.body.semester.status, "CLOSED");

    const reopen = await admin.patch(`/api/semesters/${state.winterSemesterId}/open`);

    assert.equal(reopen.status, 409);
    assert.equal(reopen.body.message, "A closed semester cannot be reopened");
  });

  it("deletes a semester with no enrollments", async () => {
    const created = await admin.post("/api/semesters", {
      body: {
        name: "Disposable",
        academicYear: "2028",
        startDate: "2028-01-01",
        endDate: "2028-06-01",
      },
    });

    const res = await admin.delete(`/api/semesters/${created.body.semester.id}`);

    assert.equal(res.status, 204);

    const gone = await admin.get(`/api/semesters/${created.body.semester.id}`);
    assert.equal(gone.status, 404);
  });

  it("updates the dates and name of a semester", async () => {
    const created = await admin.post("/api/semesters", {
      body: {
        name: "Editable",
        academicYear: "2025",
        startDate: "2025-01-01",
        endDate: "2025-06-01",
      },
    });

    const id = created.body.semester.id;

    const res = await admin.put(`/api/semesters/${id}`, {
      body: { name: "Edited", endDate: "2025-07-01" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.semester.name, "Edited");
    assert.equal(
      new Date(res.body.semester.endDate).toISOString().slice(0, 10),
      "2025-07-01"
    );
    // Fields left out keep their value.
    assert.equal(
      new Date(res.body.semester.startDate).toISOString().slice(0, 10),
      "2025-01-01"
    );

    assert.equal((await admin.delete(`/api/semesters/${id}`)).status, 204);
  });

  it("rejects a bad date or an inverted range on update", async () => {
    const created = await admin.post("/api/semesters", {
      body: {
        name: "Date Guards",
        academicYear: "2024",
        startDate: "2024-01-01",
        endDate: "2024-06-01",
      },
    });

    const id = created.body.semester.id;

    const garbage = await admin.put(`/api/semesters/${id}`, {
      body: { endDate: "whenever" },
    });

    assert.equal(garbage.status, 400);
    assert.equal(garbage.body.message, "endDate must be a valid date");

    const inverted = await admin.put(`/api/semesters/${id}`, {
      body: { startDate: "2024-07-01" },
    });

    assert.equal(inverted.status, 400);
    assert.equal(inverted.body.message, "startDate must be before endDate");

    assert.equal((await admin.delete(`/api/semesters/${id}`)).status, 204);
  });

  it("refuses to change status through a plain update", async () => {
    const res = await admin.put(
      `/api/semesters/${fixtures.semesterId.Fall}`,
      { body: { status: "OPEN" } }
    );

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "status is changed through PATCH /api/semesters/:id/open or /close"
    );
  });

  it("refuses an update with nothing to change", async () => {
    const res = await admin.put(
      `/api/semesters/${fixtures.semesterId.Fall}`,
      { body: {} }
    );

    assert.equal(res.status, 400);
    assert.match(res.body.message, /No supported fields to update/);
  });
});

describe("enrollments", () => {
  it("lets a student enroll themselves", async () => {
    const res = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE101,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.enrollment.status, "ACTIVE");
    assert.equal(res.body.enrollment.studentId, fixtures.studentId.STU001);

    state.studentEnrollmentId = res.body.enrollment.id;
  });

  it("rejects a duplicate enrollment with 409", async () => {
    const res = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE101,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 409);
    assert.equal(
      res.body.message,
      "Student is already enrolled in this course for this semester"
    );
  });

  it("rejects enrollment in a non-open semester", async () => {
    const res = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Spring,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "Enrollment is only allowed in an open semester"
    );
  });

  it("rejects an inactive student via the admin route", async () => {
    const res = await admin.post("/api/enrollments", {
      body: {
        studentId: fixtures.studentId.STU003,
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Student is not active");
  });

  it("rejects an unknown student and course", async () => {
    const unknownStudent = await admin.post("/api/enrollments", {
      body: {
        studentId: 999999,
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(unknownStudent.status, 404);
    assert.equal(unknownStudent.body.message, "Student not found");

    const unknownCourse = await admin.post("/api/enrollments", {
      body: {
        studentId: fixtures.studentId.STU002,
        courseId: 999999,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(unknownCourse.status, 404);
    assert.equal(unknownCourse.body.message, "Course not found");
  });

  it("enforces course capacity under a full course", async () => {
    const first = await student2.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE301,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(first.status, 201);

    const second = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE301,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(second.status, 409);
    assert.equal(second.body.message, "Course capacity is full");
  });

  it("lists only the caller's own enrollments", async () => {
    const res = await student.get("/api/enrollments/me");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, res.body.enrollments.length);
    assert.ok(res.body.enrollments.length > 0);

    for (const enrollment of res.body.enrollments) {
      assert.equal(enrollment.studentId, fixtures.studentId.STU001);
    }
  });

  it("hides another student's enrollment behind a 404", async () => {
    const mine = await student2.get("/api/enrollments/me");
    const otherId = mine.body.enrollments[0].id;

    const res = await student.get(`/api/enrollments/me/${otherId}`);

    assert.equal(res.status, 404);
  });

  it("lets a student read their own enrollment by id", async () => {
    const res = await student.get(
      `/api/enrollments/me/${state.studentEnrollmentId}`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.enrollment.id, state.studentEnrollmentId);
    assert.equal(res.body.enrollment.course.code, "CSE101");
  });

  it("lets a student drop their own enrollment, once", async () => {
    const dropped = await student.patch(
      `/api/enrollments/me/${state.studentEnrollmentId}/drop`
    );

    assert.equal(dropped.status, 200);
    assert.equal(dropped.body.enrollment.status, "DROPPED");
    assert.ok(dropped.body.enrollment.droppedAt);

    const again = await student.patch(
      `/api/enrollments/me/${state.studentEnrollmentId}/drop`
    );

    assert.equal(again.status, 409);
    assert.equal(again.body.message, "Enrollment is already dropped");
  });

  it("lets a student re-enroll after a drop while the semester is open", async () => {
    /*
     * Approved 2026-10-12: a drop is no longer permanent. The
     * (studentId, courseId, semesterId) unique index forbids a second row, so
     * the procedure reactivates the dropped one after the same capacity check a
     * first enrollment gets.
     */
    const res = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE101,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.enrollment.status, "ACTIVE");
    assert.equal(res.body.enrollment.id, state.studentEnrollmentId);
    assert.equal(res.body.enrollment.droppedAt, null);
  });

  it("re-checks capacity when reactivating a dropped enrollment", async () => {
    /*
     * CSE301 has capacity 1 and student2 holds the only seat. A dropped row for
     * student one on that course cannot be reactivated: reactivation takes a
     * seat like any other enrollment. The row is created directly because the
     * API cannot produce a dropped row on a course that is already full.
     */
    await db.sequelize.query(
      `INSERT INTO "Enrollments"
         ("studentId", "courseId", "semesterId", "enrollmentDate", "status", "droppedAt", "createdAt", "updatedAt")
       VALUES (:studentId, :courseId, :semesterId, CURRENT_DATE, 'DROPPED', NOW(), NOW(), NOW());`,
      {
        replacements: {
          studentId: fixtures.studentId.STU001,
          courseId: fixtures.courseId.CSE301,
          semesterId: fixtures.semesterId.Fall,
        },
      }
    );

    const res = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE301,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Course capacity is full");
  });

  it("denies a student the admin enrollment route", async () => {
    const res = await student.post("/api/enrollments", {
      body: {
        studentId: fixtures.studentId.STU002,
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 403);
  });

  it("lets an admin enroll a student on their behalf", async () => {
    const res = await admin.post("/api/enrollments", {
      body: {
        studentId: fixtures.studentId.STU002,
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.enrollment.studentId, fixtures.studentId.STU002);

    state.adminEnrollmentId = res.body.enrollment.id;
  });

  it("lets an admin list and paginate all enrollments", async () => {
    const all = await admin.get("/api/enrollments");
    assert.equal(all.status, 200);
    assert.ok(all.body.count >= 3);

    const page = await admin.get("/api/enrollments?page=1&limit=2");
    assert.equal(page.status, 200);
    assert.equal(page.body.count, 2);
    assert.ok(page.body.total >= 3);
  });

  it("filters and sorts enrollments by status and query params", async () => {
    const activeRes = await admin.get("/api/enrollments?status=ACTIVE");
    assert.equal(activeRes.status, 200);
    for (const e of activeRes.body.enrollments) {
      assert.equal(e.status, "ACTIVE");
    }

    const sortRes = await admin.get("/api/enrollments?sort=enrollmentDate&order=asc");
    assert.equal(sortRes.status, 200);

    const studentMeRes = await student.get("/api/enrollments/me?status=ACTIVE");
    assert.equal(studentMeRes.status, 200);
  });

  it("lets an admin drop any enrollment", async () => {
    const res = await admin.patch(
      `/api/enrollments/${state.adminEnrollmentId}/drop`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.enrollment.status, "DROPPED");
  });

  it("refuses to drop twice via the admin route", async () => {
    const res = await admin.patch(
      `/api/enrollments/${state.adminEnrollmentId}/drop`
    );

    assert.equal(res.status, 409);
  });

  it("returns 404 for an unknown enrollment", async () => {
    const res = await admin.get("/api/enrollments/999999");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Enrollment not found");
  });

  it("refuses to drop an enrollment once the semester is closed", async () => {
    const created = await admin.post("/api/semesters", {
      body: {
        name: "Sprint",
        academicYear: "2028",
        startDate: "2028-02-01",
        endDate: "2028-04-01",
      },
    });

    const semesterId = created.body.semester.id;

    await admin.patch(`/api/semesters/${semesterId}/open`);

    const enrolled = await student.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE201,
        semesterId,
      },
    });

    assert.equal(enrolled.status, 201);

    await admin.patch(`/api/semesters/${semesterId}/close`);

    const drop = await student.patch(
      `/api/enrollments/me/${enrolled.body.enrollment.id}/drop`
    );

    assert.equal(drop.status, 400);
    assert.equal(
      drop.body.message,
      "Enrollment cannot be dropped after the semester is closed"
    );
  });

  it("refuses an enrollment update on a dropped record", async () => {
    const res = await admin.put(
      `/api/enrollments/${state.adminEnrollmentId}`,
      { body: { courseId: fixtures.courseId.CSE101 } }
    );

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "A dropped enrollment cannot be updated");
  });

  it("denies an instructor the own-enrollment list", async () => {
    const res = await instructor.get("/api/enrollments/me");

    assert.equal(res.status, 403);
  });

  it("returns 404 when a permitted user has no student profile", async () => {
    // SUPER_ADMIN holds OWN_ENROLLMENT_CREATE_DROP but is not a student.
    const res = await superAdmin.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Fall,
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Student profile not found");
  });

  it("refuses to delete a semester that has enrollments", async () => {
    const res = await admin.delete(`/api/semesters/${fixtures.semesterId.Fall}`);

    assert.equal(res.status, 409);
    assert.equal(
      res.body.message,
      "Cannot delete a semester that has enrollments"
    );
  });
});

describe("instructor assignments", () => {
  it("assigns an instructor to a course", async () => {
    const res = await admin.post(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`,
      { body: { instructorId: fixtures.instructorId } }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.assignment.courseId, fixtures.courseId.CSE101);
  });

  it("rejects a duplicate assignment with 409", async () => {
    const res = await admin.post(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`,
      { body: { instructorId: fixtures.instructorId } }
    );

    assert.equal(res.status, 409);
    assert.equal(
      res.body.message,
      "Course is already assigned to this instructor"
    );
  });

  it("rejects an unknown instructor with 404", async () => {
    const res = await admin.post(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`,
      { body: { instructorId: 999999 } }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Instructor not found");
  });

  it("lets the instructor list their assigned courses", async () => {
    const res = await instructor.get("/api/courses/instructors/me/courses");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.courses[0].code, "CSE101");
  });

  it("denies a student the instructor course list", async () => {
    const res = await student.get("/api/courses/instructors/me/courses");

    assert.equal(res.status, 403);
  });

  it("returns an empty list when a course has no assigned instructors", async () => {
    const res = await admin.get(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);
    assert.deepEqual(res.body.instructors, []);
  });

  it("lists assigned instructors with expected fields and no sensitive data", async () => {
    const res = await admin.get(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    const assigned = res.body.instructors[0];
    assert.equal(assigned.id, fixtures.instructorId);
    assert.equal(assigned.employeeCode, "EMP001");
    assert.equal(assigned.user.name, "Instructor User");
    assert.equal(assigned.user.email, EMAILS.instructor);
    assert.ok(assigned.CourseInstructor?.assignedAt);
    assert.equal(assigned.user.passwordHash, undefined);
    assert.equal(assigned.user.refreshToken, undefined);
  });

  it("returns 404 when listing instructors for an unknown course", async () => {
    const res = await admin.get("/api/courses/999999/instructors");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Course not found");
  });

  it("returns 400 when listing instructors with a non-numeric course id", async () => {
    const res = await admin.get("/api/courses/notanid/instructors");

    assert.equal(res.status, 400);
  });

  it("denies unauthenticated requests to list course instructors", async () => {
    const res = await anon.get(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`
    );

    assert.equal(res.status, 401);
  });

  it("denies a student from listing course instructors", async () => {
    const res = await student.get(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`
    );

    assert.equal(res.status, 403);
  });

  it("allows superAdmin to list course instructors", async () => {
    const res = await superAdmin.get(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
  });

  it("removes the assignment and then reports it missing", async () => {
    const removed = await admin.delete(
      `/api/courses/${fixtures.courseId.CSE101}/instructors/${fixtures.instructorId}`
    );

    assert.equal(removed.status, 204);

    const listAfterRemoval = await admin.get(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`
    );
    assert.equal(listAfterRemoval.status, 200);
    assert.equal(listAfterRemoval.body.count, 0);
    assert.deepEqual(listAfterRemoval.body.instructors, []);

    const again = await admin.delete(
      `/api/courses/${fixtures.courseId.CSE101}/instructors/${fixtures.instructorId}`
    );

    assert.equal(again.status, 404);
    assert.equal(again.body.message, "Course assignment not found");
  });

  it("supports multiple assigned instructors on a single course", async () => {
    const [roles] = await db.sequelize.query(`SELECT "id" FROM "Roles" WHERE "name" = 'INSTRUCTOR';`);
    const instructorRoleId = roles[0].id;

    const [userRows] = await db.sequelize.query(`
      INSERT INTO "Users" ("name", "email", "passwordHash", "roleId", "status", "createdAt", "updatedAt")
      VALUES ('Second Instructor', 'instructor2@test.local', 'dummyhash', ${instructorRoleId}, 'ACTIVE', NOW(), NOW())
      RETURNING "id";
    `);
    const secondUserId = userRows[0].id;

    const [instRows] = await db.sequelize.query(`
      INSERT INTO "Instructors" ("userId", "departmentId", "employeeCode", "designation", "status", "createdAt", "updatedAt")
      VALUES (${secondUserId}, ${fixtures.departmentId}, 'EMP002', 'Lecturer', 'ACTIVE', NOW(), NOW())
      RETURNING "id";
    `);
    const secondInstructorId = instRows[0].id;

    await admin.post(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`,
      { body: { instructorId: fixtures.instructorId } }
    );
    await admin.post(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`,
      { body: { instructorId: secondInstructorId } }
    );

    const res = await admin.get(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.instructors[0].employeeCode, "EMP001");
    assert.equal(res.body.instructors[1].employeeCode, "EMP002");

    // Clean up
    await admin.delete(
      `/api/courses/${fixtures.courseId.CSE201}/instructors/${fixtures.instructorId}`
    );
    await admin.delete(
      `/api/courses/${fixtures.courseId.CSE201}/instructors/${secondInstructorId}`
    );
    await db.sequelize.query(`DELETE FROM "Instructors" WHERE "id" = ${secondInstructorId};`);
    await db.sequelize.query(`DELETE FROM "Users" WHERE "id" = ${secondUserId};`);

    const resAfter = await admin.get(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`
    );
    assert.equal(resAfter.status, 200);
    assert.equal(resAfter.body.count, 0);
  });
});

describe("course rosters and grade management", () => {
  it("returns 200 and an empty list when a course has no enrollments", async () => {
    const res = await admin.get(
      `/api/courses/${fixtures.courseId.CSE999}/enrollments`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);
    assert.deepEqual(res.body.enrollments, []);
  });

  it("returns 404 when querying roster for an unknown course", async () => {
    const res = await admin.get("/api/courses/999999/enrollments");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Course not found");
  });

  it("returns 400 when querying roster with a non-numeric course id", async () => {
    const res = await admin.get("/api/courses/not-a-number/enrollments");

    assert.equal(res.status, 400);
  });

  it("denies unauthenticated requests to view course roster", async () => {
    const res = await anon.get(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments`
    );

    assert.equal(res.status, 401);
  });

  it("denies a student from viewing the course roster", async () => {
    const res = await student.get(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments`
    );

    assert.equal(res.status, 403);
  });

  it("denies an unassigned instructor from viewing course roster", async () => {
    // Currently instructor is not assigned to CSE101
    const res = await instructor.get(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments`
    );

    assert.equal(res.status, 403);
    assert.equal(res.body.message, "You are not assigned to teach this course");
  });

  it("allows assigned instructor to view course roster with student details and grades", async () => {
    // Assign instructor to CSE101
    await admin.post(
      `/api/courses/${fixtures.courseId.CSE101}/instructors`,
      { body: { instructorId: fixtures.instructorId } }
    );

    const res = await instructor.get(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments`
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
    const enrollment = res.body.enrollments.find(
      (e) => String(e.id) === String(state.studentEnrollmentId)
    );
    assert.ok(enrollment);
    assert.equal(enrollment.student.studentCode, "STU001");
    assert.equal(enrollment.student.user.name, "Student One");
    assert.equal(enrollment.student.user.email, EMAILS.student);
    assert.equal(enrollment.student.user.passwordHash, undefined);
    assert.equal(enrollment.student.department.code, "CSE");
    assert.equal(enrollment.semester.name, "Fall");
  });

  it("allows admin to view course roster without being an assigned instructor", async () => {
    const res = await admin.get(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments`
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
  });

  it("denies an unassigned instructor from recording grades", async () => {
    const res = await instructor.patch(
      `/api/courses/${fixtures.courseId.CSE201}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "A" } }
    );

    assert.equal(res.status, 403);
  });

  it("denies a student from recording grades", async () => {
    const res = await student.patch(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "A" } }
    );

    assert.equal(res.status, 403);
  });

  it("rejects an invalid grade with 400", async () => {
    const res = await instructor.patch(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "INVALID" } }
    );

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid grade/);
  });

  it("rejects grade recording on an unknown enrollment with 404", async () => {
    const res = await instructor.patch(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments/999999/grade`,
      { body: { grade: "A" } }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Enrollment not found");
  });

  it("rejects cross-course enrollment grade recording with 400", async () => {
    // Assign instructor to CSE201 as well
    await admin.post(
      `/api/courses/${fixtures.courseId.CSE201}/instructors`,
      { body: { instructorId: fixtures.instructorId } }
    );

    // studentEnrollmentId belongs to CSE101, but request specifies CSE201
    const res = await instructor.patch(
      `/api/courses/${fixtures.courseId.CSE201}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "A" } }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Enrollment does not belong to this course");

    // Clean up CSE201 assignment
    await admin.delete(
      `/api/courses/${fixtures.courseId.CSE201}/instructors/${fixtures.instructorId}`
    );
  });

  it("records and updates a grade, persisting across queries", async () => {
    // Record grade "A"
    const recordRes = await instructor.patch(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "A" } }
    );

    assert.equal(recordRes.status, 200);
    assert.equal(recordRes.body.enrollment.grade, "A");

    // Verify persistence via GET roster
    const rosterRes = await instructor.get(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments`
    );
    const updated = rosterRes.body.enrollments.find(
      (e) => String(e.id) === String(state.studentEnrollmentId)
    );
    assert.equal(updated.grade, "A");

    // Update to "A-" via PUT
    const putRes = await instructor.put(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "A-" } }
    );
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.enrollment.grade, "A-");

    // Admin can also update grade
    const adminRes = await admin.patch(
      `/api/courses/${fixtures.courseId.CSE101}/enrollments/${state.studentEnrollmentId}/grade`,
      { body: { grade: "A+" } }
    );
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.enrollment.grade, "A+");

    // Clean up: unassign instructor from CSE101
    await admin.delete(
      `/api/courses/${fixtures.courseId.CSE101}/instructors/${fixtures.instructorId}`
    );
  });
});

describe("error handling", () => {
  it("does not leak internals on an unexpected failure", async () => {
    /*
     * A duplicate course code reaching the database directly would normally
     * surface a raw constraint name. The duplicate check answers first, so this
     * asserts the generic 500 shape instead by sending a body whose values
     * cannot be cast, which the driver rejects.
     */
    const res = await admin.post("/api/courses", {
      body: {
        departmentId: "not-a-number",
        code: "CSE777",
        name: "Broken",
        credits: 3,
      },
    });

    assert.ok([400, 404, 500].includes(res.status));
    assert.equal(typeof res.body.message, "string");
    assert.doesNotMatch(res.body.message, /pg_|sequelize|relation "|constraint/i);
  });
});

describe("request validation", () => {
  it("rejects a malformed numeric route parameter with 400", async () => {
    const paths = [
      "/api/courses/not-a-number",
      "/api/semesters/not-a-number",
      "/api/enrollments/not-a-number",
      "/api/departments/not-a-number",
      "/api/instructors/not-a-number",
    ];

    for (const path of paths) {
      const res = await admin.get(path);

      assert.equal(res.status, 400, `${path} should be rejected`);
      assert.equal(res.body.message, "id must be a positive integer");
    }
  });

  it("rejects a malformed nested route parameter with 400", async () => {
    const res = await admin.delete(
      `/api/courses/${fixtures.courseId.CSE101}/instructors/nope`
    );

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "instructorId must be a positive integer"
    );
  });

  it("returns 404 for an unknown route", async () => {
    const res = await admin.get("/api/does-not-exist");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Route not found");
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json",
    });

    assert.equal(res.status, 400);
    assert.equal((await res.json()).message, "Malformed JSON body");
  });

  it("rejects an unrecognized query filter with 400", async () => {
    const res = await admin.get("/api/departments?isActive=yes");

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'isActive must be "true" or "false"');
  });
});

/*
 * The access token only carries a user id and a role id. These tests pin down
 * that the server re-reads the user on every request instead of trusting the
 * claims, so disabling an account or moving it to another role takes effect
 * immediately rather than at token expiry.
 */
describe("access-token freshness", () => {
  const secret = process.env.JWT_ACCESS_SECRET;

  const signFor = (userId, roleId) =>
    jwt.sign({ sub: String(userId), roleId: String(roleId) }, secret, {
      expiresIn: "15m",
    });

  it("rejects a valid token whose account is not active", async () => {
    const res = await anon.get("/api/users/me", {
      token: signFor(fixtures.userId[EMAILS.inactiveStudent], 4),
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Account is inactive");
  });

  it("rejects a valid token for a user that no longer exists", async () => {
    const res = await anon.get("/api/users/me", {
      token: signFor(2147483000, 1),
    });

    assert.equal(res.status, 401);
  });

  it("authorizes from the stored role, not the role in the token", async () => {
    const [roles] = await db.sequelize.query(
      `SELECT "id", "name" FROM "Roles";`
    );

    const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    const [inserted] = await db.sequelize.query(
      `INSERT INTO "Users"
         ("name", "email", "passwordHash", "roleId", "status", "createdAt", "updatedAt")
       VALUES
         ('Stale Role', 'stale.role@test.local', 'unused', :roleId, 'ACTIVE', NOW(), NOW())
       RETURNING "id";`,
      { replacements: { roleId: roleId.STUDENT } }
    );

    const userId = inserted[0].id;
    // The token keeps claiming STUDENT for the whole test.
    const token = signFor(userId, roleId.STUDENT);

    try {
      const asStudent = await anon.get("/api/courses/catalog", { token });
      assert.equal(asStudent.status, 200);

      await db.sequelize.query(
        `UPDATE "Users" SET "roleId" = :roleId WHERE "id" = :id;`,
        { replacements: { roleId: roleId.INSTRUCTOR, id: userId } }
      );

      // INSTRUCTOR does not hold COURSE_CATALOG_VIEW.
      const afterPromotion = await anon.get("/api/courses/catalog", { token });
      assert.equal(afterPromotion.status, 403);
    } finally {
      await db.sequelize.query(`DELETE FROM "Users" WHERE "id" = :id;`, {
        replacements: { id: userId },
      });
    }
  });
});

describe("login rate limiting", () => {
  it("throttles repeated failed logins and recovers", async () => {
    resetRateLimits();

    const client = createClient(baseUrl);

    let lastStatus = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const res = await client.post("/api/auth/login", {
        body: { email: "nobody@test.local", password: "wrong-password" },
      });

      lastStatus = res.status;
    }

    assert.equal(lastStatus, 429);

    // Clearing the window lets legitimate traffic through again.
    resetRateLimits();

    const recovered = await client.post("/api/auth/login", {
      body: { email: EMAILS.admin, password: PASSWORD },
    });

    assert.equal(recovered.status, 200);
  });
});

describe("departments API", () => {
  let createdId;

  it("lists departments including the fixture department", async () => {
    const res = await admin.get("/api/departments");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.departments[0].code, "CSE");
    // No page or limit supplied, so no pagination metadata is added.
    assert.equal(res.body.total, undefined);
  });

  it("paginates when asked", async () => {
    const res = await admin.get("/api/departments?page=1&limit=10");

    assert.equal(res.status, 200);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 10);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.totalPages, 1);
  });

  it("requires authentication", async () => {
    const res = await anon.get("/api/departments");

    assert.equal(res.status, 401);
  });

  it("denies a student", async () => {
    const res = await student.get("/api/departments");

    assert.equal(res.status, 403);
  });

  it("creates a department", async () => {
    const res = await admin.post("/api/departments", {
      body: { name: "Mathematics", code: "MATH" },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.department.code, "MATH");
    assert.equal(res.body.message, "Department created successfully");

    createdId = res.body.department.id;
  });

  it("rejects a duplicate code", async () => {
    const res = await admin.post("/api/departments", {
      body: { name: "Pure Mathematics", code: "MATH" },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Department code already exists");
  });

  it("rejects a body without a name or code", async () => {
    const res = await admin.post("/api/departments", {
      body: { name: "  ", code: "" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "name and code are required");
  });

  it("returns 404 for a department that does not exist", async () => {
    const res = await admin.get("/api/departments/2147483000");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Department not found");
  });

  it("updates a department", async () => {
    const res = await admin.put(`/api/departments/${createdId}`, {
      body: { description: "Discrete and applied mathematics" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Department updated successfully");
    assert.equal(
      res.body.department.description,
      "Discrete and applied mathematics"
    );
  });

  it("deactivates a department", async () => {
    const res = await admin.put(`/api/departments/${createdId}`, {
      body: { isActive: false },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.department.isActive, false);
  });

  it("rejects a non-boolean isActive", async () => {
    const res = await admin.put(`/api/departments/${createdId}`, {
      body: { isActive: "no" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "isActive must be a boolean");
  });

  it("refuses to delete a department that is still referenced", async () => {
    const res = await admin.delete(`/api/departments/${fixtures.departmentId}`);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /Deactivate it instead/);
  });

  it("deletes an unreferenced department", async () => {
    const res = await admin.delete(`/api/departments/${createdId}`);

    assert.equal(res.status, 204);

    const again = await admin.delete(`/api/departments/${createdId}`);
    assert.equal(again.status, 404);
  });
});

describe("instructors API", () => {
  it("lists instructors with their user account", async () => {
    const res = await admin.get("/api/instructors");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.instructors[0].employeeCode, "EMP001");
    assert.equal(
      res.body.instructors[0].user.email,
      EMAILS.instructor
    );
    assert.equal(res.body.instructors[0].department.code, "CSE");
  });

  it("searches by employee code", async () => {
    const res = await admin.get("/api/instructors?search=EMP001");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
  });

  it("returns no rows for a non-matching search", async () => {
    const res = await admin.get("/api/instructors?search=ZZZ999");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);
  });

  it("filters by department", async () => {
    const res = await admin.get(
      `/api/instructors?departmentId=${fixtures.departmentId}`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
  });

  it("rejects a malformed departmentId filter", async () => {
    const res = await admin.get("/api/instructors?departmentId=abc");

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "departmentId must be a positive integer");
  });

  it("rejects an unrecognized status filter", async () => {
    const res = await admin.get("/api/instructors?status=RETIRED");

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "status must be one of: ACTIVE, INACTIVE"
    );
  });

  it("returns an instructor with assigned courses", async () => {
    const res = await admin.get(`/api/instructors/${fixtures.instructorId}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.instructor.employeeCode, "EMP001");
    assert.ok(Array.isArray(res.body.instructor.courses));
  });

  it("returns 404 for an instructor that does not exist", async () => {
    const res = await admin.get("/api/instructors/2147483000");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Instructor not found");
  });

  it("denies a student", async () => {
    const res = await student.get("/api/instructors");

    assert.equal(res.status, 403);
  });

  it("denies an instructor without INSTRUCTOR_MANAGE", async () => {
    const res = await instructor.get("/api/instructors");

    assert.equal(res.status, 403);
  });
});

describe("user administration", () => {
  const NEW = {
    student: "new.student@test.local",
    instructor: "new.instructor@test.local",
    admin: "new.admin@test.local",
    superAdmin: "new.superadmin@test.local",
    weak: "weak@test.local",
    rollback: "rollback@test.local",
  };
  const NEW_PASSWORD = "Str0ngPass!";

  const createBody = (overrides) => ({
    name: "New Person",
    email: NEW.student,
    password: NEW_PASSWORD,
    role: "STUDENT",
    student: {
      departmentId: fixtures.departmentId,
      studentCode: "STU900",
      admissionDate: "2026-10-12",
    },
    ...overrides,
  });

  it("creates a student account and its profile together", async () => {
    const res = await admin.post("/api/users", { body: createBody({}) });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, "STUDENT");
    assert.equal(res.body.user.status, "ACTIVE");
    assert.equal(res.body.user.email, NEW.student);

    // The account is usable straight away.
    const client = createClient(baseUrl);
    const loggedIn = await client.post("/api/auth/login", {
      body: { email: NEW.student, password: NEW_PASSWORD },
    });

    assert.equal(loggedIn.status, 200);
  });

  it("never returns a password hash", async () => {
    const res = await admin.get("/api/users?limit=100");

    assert.equal(res.status, 200);
    assert.ok(res.body.count > 0);

    for (const user of res.body.users) {
      assert.equal(user.passwordHash, undefined);
      assert.equal(typeof user.password, "undefined");
    }
  });

  it("creates an instructor account and its profile together", async () => {
    const res = await admin.post("/api/users", {
      body: {
        name: "New Instructor",
        email: NEW.instructor,
        password: NEW_PASSWORD,
        role: "INSTRUCTOR",
        instructor: {
          departmentId: fixtures.departmentId,
          employeeCode: "EMP900",
          designation: "Lecturer",
        },
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, "INSTRUCTOR");

    const listed = await admin.get("/api/instructors?search=EMP900");
    assert.equal(listed.body.count, 1);
    assert.equal(listed.body.instructors[0].designation, "Lecturer");
  });

  it("rolls the user row back when the profile is rejected", async () => {
    const res = await admin.post("/api/users", {
      body: createBody({
        email: NEW.rollback,
        student: {
          departmentId: fixtures.departmentId,
          // STU001 belongs to the fixture student.
          studentCode: "STU001",
          admissionDate: "2026-10-12",
        },
      }),
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "studentCode is already in use");

    const orphan = await admin.get(`/api/users?search=${NEW.rollback}`);
    assert.equal(orphan.body.count, 0, "the user row must not survive");
  });

  it("rejects an unparseable admission date", async () => {
    const res = await admin.post("/api/users", {
      body: createBody({
        email: "baddate@test.local",
        student: {
          departmentId: fixtures.departmentId,
          studentCode: "STU901",
          admissionDate: "the thirty-first",
        },
      }),
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "student.admissionDate must be a valid date");

    const orphan = await admin.get("/api/users?search=baddate@test.local");
    assert.equal(orphan.body.count, 0, "the user row must not survive");
  });

  it("rejects a duplicate email", async () => {
    const res = await admin.post("/api/users", {
      body: createBody({ email: EMAILS.student }),
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Email is already registered");
  });

  it("rejects a password shorter than eight characters", async () => {
    const res = await admin.post("/api/users", {
      body: createBody({ email: NEW.weak, password: "short" }),
    });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.message,
      "password must be at least 8 characters"
    );
  });

  it("rejects a student body without a profile", async () => {
    const res = await admin.post("/api/users", {
      body: createBody({ email: "noprofile@test.local", student: undefined }),
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "student.departmentId is required");
  });

  it("refuses to let an ADMIN create an ADMIN", async () => {
    const res = await admin.post("/api/users", {
      body: createBody({ email: NEW.admin, role: "ADMIN", student: undefined }),
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.message, "You cannot create or assign the role ADMIN");
  });

  it("refuses to create a SUPER_ADMIN, even as a SUPER_ADMIN", async () => {
    const res = await superAdmin.post("/api/users", {
      body: createBody({
        email: NEW.superAdmin,
        role: "SUPER_ADMIN",
        student: undefined,
      }),
    });

    assert.equal(res.status, 403);
    assert.equal(
      res.body.message,
      "You cannot create or assign the role SUPER_ADMIN"
    );
  });

  it("rejects an unknown role", async () => {
    const res = await superAdmin.post("/api/users", {
      body: createBody({ email: "ghost@test.local", role: "PRINCIPAL", student: undefined }),
    });

    assert.equal(res.status, 403);
  });

  it("lets an ADMIN create an INSTRUCTOR but not manage a SUPER_ADMIN", async () => {
    const created = await admin.post("/api/users", {
      body: {
        name: "Second Instructor",
        email: "second.instructor@test.local",
        password: NEW_PASSWORD,
        role: "INSTRUCTOR",
        instructor: {
          departmentId: fixtures.departmentId,
          employeeCode: "EMP901",
          designation: "Tutor",
        },
      },
    });

    assert.equal(created.status, 201);

    const escalation = await admin.put(
      `/api/users/${fixtures.userId[EMAILS.superAdmin]}`,
      { body: { name: "Renamed" } }
    );

    assert.equal(escalation.status, 403);
    assert.equal(
      escalation.body.message,
      "You cannot manage SUPER_ADMIN accounts"
    );
  });

  it("lists users with filters for an admin", async () => {
    const all = await admin.get("/api/users?page=1&limit=5");

    assert.equal(all.status, 200);
    assert.equal(all.body.count, 5);
    assert.ok(all.body.total > 5);

    const instructors = await admin.get("/api/users?search=new.instructor");
    assert.equal(instructors.body.count, 1);
    assert.equal(instructors.body.users[0].role, "INSTRUCTOR");
  });

  it("returns one user by id", async () => {
    const res = await admin.get(
      `/api/users/${fixtures.userId[EMAILS.student]}`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, "STUDENT");

    const missing = await admin.get("/api/users/2147483000");
    assert.equal(missing.status, 404);
  });

  it("denies a student the user list", async () => {
    assert.equal((await student.get("/api/users")).status, 403);
    assert.equal((await instructor.get("/api/users")).status, 403);
  });

  it("updates a user's name and email", async () => {
    const target = fixtures.userId[EMAILS.student2];

    const res = await admin.put(`/api/users/${target}`, {
      body: { name: "Student Two Renamed" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "User updated successfully");
    assert.equal(res.body.user.name, "Student Two Renamed");
    // The role is unchanged by a name edit.
    assert.equal(res.body.user.role, "STUDENT");
  });

  it("refuses a role change while a profile exists", async () => {
    const res = await admin.put(
      `/api/users/${fixtures.userId[EMAILS.student2]}`,
      { body: { role: "INSTRUCTOR" } }
    );

    assert.equal(res.status, 409);
    assert.match(res.body.message, /profile/);
  });

  it("refuses to let an admin change their own role or status", async () => {
    const self = fixtures.userId[EMAILS.admin];

    const role = await admin.put(`/api/users/${self}`, {
      body: { role: "STUDENT" },
    });

    assert.equal(role.status, 403);
    assert.equal(role.body.message, "You cannot change your own role");

    const status = await admin.put(`/api/users/${self}`, {
      body: { status: "INACTIVE" },
    });

    assert.equal(status.status, 403);
    assert.equal(status.body.message, "You cannot change your own status");
  });

  it("rejects an unknown status", async () => {
    const res = await admin.put(
      `/api/users/${fixtures.userId[EMAILS.student2]}`,
      { body: { status: "SUSPENDED" } }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "status must be one of: ACTIVE, INACTIVE");
  });

  it("rejects an update with no supported fields", async () => {
    const res = await admin.put(
      `/api/users/${fixtures.userId[EMAILS.student2]}`,
      { body: { departmentId: 1 } }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "No supported fields to update");
  });

  it("ends a disabled account's session immediately", async () => {
    const client = createClient(baseUrl);
    const signedIn = await client.post("/api/auth/login", {
      body: { email: NEW.student, password: NEW_PASSWORD },
    });

    const context = signedIn.body.tabContext;
    const cookieName = cookieNameFor(context);
    const token = client.cookies.get(cookieName);

    const disable = await admin.put(
      `/api/users/${(await admin.get(`/api/users?search=${NEW.student}`)).body.users[0].id}`,
      { body: { status: "INACTIVE" } }
    );

    assert.equal(disable.status, 200);
    assert.equal(disable.body.user.status, "INACTIVE");

    const after = createClient(baseUrl);
    after.cookies.set(cookieName, token);

    // Refresh rejects an inactive account, so the session cannot be renewed.
    const refreshed = await refreshTab(after, context);
    assert.equal(refreshed.status, 401);
  });

  it("has no HTTP path to demote or disable the last active super admin", async () => {
    /*
     * Two rules make this unreachable over HTTP: a SUPER_ADMIN cannot disable
     * itself, and an ADMIN cannot manage a SUPER_ADMIN. The counting guard is
     * still exercised directly, because it is the check that matters if either
     * of those rules is ever relaxed.
     */
    const { assertNotLastSuperAdmin } = await import(
      "../src/services/user/userAdminRules.js"
    );

    await assert.rejects(
      assertNotLastSuperAdmin({
        excludingUserId: fixtures.userId[EMAILS.superAdmin],
      }),
      /last active SUPER_ADMIN/
    );
  });
});

describe("role administration", () => {
  it("lists roles with their permission names", async () => {
    const res = await admin.get("/api/roles");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 4);

    const studentRole = res.body.roles.find((r) => r.name === "STUDENT");
    assert.ok(studentRole.permissions.includes("COURSE_CATALOG_VIEW"));
  });

  it("denies a non-admin", async () => {
    assert.equal((await student.get("/api/roles")).status, 403);
    assert.equal((await instructor.get("/api/roles")).status, 403);
  });

  it("replaces a role's grants", async () => {
    const roles = await admin.get("/api/roles");
    const target = roles.body.roles.find((r) => r.name === "INSTRUCTOR");

    const res = await superAdmin.put(
      `/api/roles/${target.id}/permissions`,
      {
        body: {
          permissions: [...target.permissions, "SYSTEM_CONFIG_MANAGE"],
        },
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Role permissions updated successfully");
    assert.ok(res.body.role.permissions.includes("SYSTEM_CONFIG_MANAGE"));

    const reread = await admin.get("/api/roles");
    const updated = reread.body.roles.find((r) => r.name === "INSTRUCTOR");
    assert.ok(updated.permissions.includes("SYSTEM_CONFIG_MANAGE"));
  });

  it("refuses to let a role change its own permissions", async () => {
    const roles = await superAdmin.get("/api/roles");
    const own = roles.body.roles.find((r) => r.name === "SUPER_ADMIN");

    const res = await superAdmin.put(`/api/roles/${own.id}/permissions`, {
      body: { permissions: [] },
    });

    assert.equal(res.status, 403);
    assert.equal(
      res.body.message,
      "You cannot change the permissions of your own role"
    );
  });

  it("rejects an unknown permission name", async () => {
    const roles = await superAdmin.get("/api/roles");
    const target = roles.body.roles.find((r) => r.name === "INSTRUCTOR");

    const res = await superAdmin.put(`/api/roles/${target.id}/permissions`, {
      body: { permissions: ["NOT_A_PERMISSION"] },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Unknown permission: NOT_A_PERMISSION");
  });

  it("rejects a body that is not an array of names", async () => {
    const roles = await superAdmin.get("/api/roles");
    const target = roles.body.roles.find((r) => r.name === "INSTRUCTOR");

    const res = await superAdmin.put(`/api/roles/${target.id}/permissions`, {
      body: { permissions: "COURSE_ASSIGN" },
    });

    assert.equal(res.status, 400);
  });

  it("denies an ADMIN without PERMISSION_ASSIGN", async () => {
    const roles = await admin.get("/api/roles");
    const target = roles.body.roles.find((r) => r.name === "INSTRUCTOR");

    const res = await admin.put(`/api/roles/${target.id}/permissions`, {
      body: { permissions: ["COURSE_ASSIGN"] },
    });

    assert.equal(res.status, 403);
  });

  it("returns 404 for an unknown role", async () => {
    const res = await superAdmin.put("/api/roles/2147483000/permissions", {
      body: { permissions: [] },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Role not found");
  });
});

describe("students API", () => {
  it("lists students with their account and department", async () => {
    const res = await admin.get("/api/students");

    assert.equal(res.status, 200);
    // STU001-STU003 from the fixtures, plus STU900 created above.
    assert.equal(res.body.count, 4);
    assert.equal(res.body.students[0].studentCode, "STU001");
    assert.equal(typeof res.body.students[0].user.email, "string");
    assert.equal(res.body.students[0].department.code, "CSE");
  });

  it("filters by status and department", async () => {
    const inactive = await admin.get("/api/students?status=INACTIVE");

    assert.equal(inactive.status, 200);
    assert.equal(inactive.body.count, 1);
    assert.equal(inactive.body.students[0].studentCode, "STU003");

    const byDepartment = await admin.get(
      `/api/students?departmentId=${fixtures.departmentId}`
    );

    assert.equal(byDepartment.body.count, 4);
  });

  it("searches by student code", async () => {
    const res = await admin.get("/api/students?search=STU002");

    assert.equal(res.body.count, 1);
    assert.equal(res.body.students[0].studentCode, "STU002");
  });

  it("rejects malformed filters", async () => {
    assert.equal((await admin.get("/api/students?status=GRADUATED")).status, 400);
    assert.equal((await admin.get("/api/students?departmentId=x")).status, 400);
  });

  it("returns a student with their enrollments", async () => {
    const res = await admin.get(
      `/api/students/${fixtures.studentId.STU001}`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.student.studentCode, "STU001");
    assert.ok(Array.isArray(res.body.student.enrollments));
    assert.ok(res.body.student.enrollments.length > 0);
    assert.equal(
      typeof res.body.student.enrollments[0].course.code,
      "string"
    );
  });

  it("returns 404 for an unknown student", async () => {
    const res = await admin.get("/api/students/2147483000");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Student not found");
  });

  it("denies students and instructors", async () => {
    assert.equal((await student.get("/api/students")).status, 403);
    assert.equal((await instructor.get("/api/students")).status, 403);
  });
});

describe("instructor profile updates", () => {
  it("updates a designation", async () => {
    const res = await admin.put(
      `/api/instructors/${fixtures.instructorId}`,
      { body: { designation: "Associate Professor" } }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Instructor updated successfully");
    assert.equal(res.body.instructor.designation, "Associate Professor");
  });

  it("rejects an unknown department and an unknown status", async () => {
    const badDepartment = await admin.put(
      `/api/instructors/${fixtures.instructorId}`,
      { body: { departmentId: 2147483000 } }
    );

    assert.equal(badDepartment.status, 404);
    assert.equal(badDepartment.body.message, "Department not found");

    const badStatus = await admin.put(
      `/api/instructors/${fixtures.instructorId}`,
      { body: { status: "RETIRED" } }
    );

    assert.equal(badStatus.status, 400);
  });

  it("returns 404 for an unknown instructor", async () => {
    const res = await admin.put("/api/instructors/2147483000", {
      body: { designation: "Ghost" },
    });

    assert.equal(res.status, 404);
  });

  it("denies an instructor editing their own profile", async () => {
    const res = await instructor.put(
      `/api/instructors/${fixtures.instructorId}`,
      { body: { designation: "Self Appointed" } }
    );

    assert.equal(res.status, 403);
  });
});

describe("audit log", () => {
  it("records the admin changes made above across all mutation categories", async () => {
    const res = await admin.get("/api/audit-logs?limit=100");

    assert.equal(res.status, 200);
    assert.ok(res.body.total > 0, "expected audit rows");

    const operations = res.body.auditLogs.map((row) => row.operation);
    assert.ok(operations.includes("CREATE_USER"), "expected CREATE_USER");
    assert.ok(operations.includes("UPDATE_USER"), "expected UPDATE_USER");
    assert.ok(operations.includes("UPDATE_ROLE_PERMISSIONS"), "expected UPDATE_ROLE_PERMISSIONS");
    assert.ok(operations.includes("CREATE_COURSE"), "expected CREATE_COURSE");
    assert.ok(operations.includes("CREATE_DEPARTMENT"), "expected CREATE_DEPARTMENT");
    assert.ok(operations.includes("CREATE_SEMESTER"), "expected CREATE_SEMESTER");
    assert.ok(operations.includes("CREATE_ENROLLMENT"), "expected CREATE_ENROLLMENT");

    // Actor attribution
    const withActor = res.body.auditLogs.find(
      (row) => row.operation === "CREATE_USER"
    );
    assert.equal(withActor.admin.email, EMAILS.admin);
    assert.equal(withActor.targetType, "User");
    assert.ok(withActor.targetId);

    const courseLog = res.body.auditLogs.find(
      (row) => row.operation === "CREATE_COURSE"
    );
    assert.equal(courseLog.admin.email, EMAILS.admin);
    assert.equal(courseLog.targetType, "Course");
    assert.ok(courseLog.targetId);

    const deptLog = res.body.auditLogs.find(
      (row) => row.operation === "CREATE_DEPARTMENT"
    );
    assert.equal(deptLog.admin.email, EMAILS.admin);
    assert.equal(deptLog.targetType, "Department");
    assert.ok(deptLog.targetId);
  });

  it("paginates and filters by operation", async () => {
    const page = await admin.get("/api/audit-logs?page=1&limit=2");

    assert.equal(page.status, 200);
    assert.equal(page.body.count, 2);
    assert.equal(page.body.page, 1);

    const filtered = await admin.get(
      "/api/audit-logs?operation=UPDATE_ROLE_PERMISSIONS"
    );

    // Unpaginated list responses carry `count`, not `total`.
    assert.equal(filtered.body.count, 1);
    assert.equal(filtered.body.auditLogs[0].targetType, "Role");

    // Category filter: CREATE
    const creations = await admin.get("/api/audit-logs?operation=CREATE");
    assert.ok(creations.body.count > 0);
    for (const log of creations.body.auditLogs) {
      assert.ok(
        log.operation === "CREATE" || log.operation.startsWith("CREATE_"),
        `Expected create operation but got ${log.operation}`
      );
    }
  });

  it("searches audit logs by targetType or keyword", async () => {
    const res = await admin.get("/api/audit-logs?search=Course");
    assert.equal(res.status, 200);
    assert.ok(res.body.count > 0);
    for (const log of res.body.auditLogs) {
      const match =
        log.operation.includes("COURSE") ||
        log.targetType === "Course" ||
        log.admin.email.includes("Course");
      assert.ok(match, `Expected course match in log: ${JSON.stringify(log)}`);
    }
  });

  it("rolls back audit log write when the business operation fails", async () => {
    const beforeCount = (await admin.get("/api/audit-logs?operation=CREATE_COURSE")).body.count;

    // Trigger failure: missing required fields
    const failedRes = await admin.post("/api/courses", {
      body: { code: "INVALID" },
    });
    assert.equal(failedRes.status, 400);

    const afterCount = (await admin.get("/api/audit-logs?operation=CREATE_COURSE")).body.count;
    assert.equal(afterCount, beforeCount, "Audit log must not be created on failed operation");
  });

  it("denies a student and an instructor", async () => {
    assert.equal((await student.get("/api/audit-logs")).status, 403);
    assert.equal((await instructor.get("/api/audit-logs")).status, 403);
  });
});

describe("POST /api/auth/register", () => {
  // Registration is counted per source address on entry, and every request in
  // this file comes from the same address.
  beforeEach(() => resetRateLimits());

  const registration = (overrides = {}) => ({
    name: "Registered Student",
    email: `registered.${crypto.randomUUID()}@test.local`,
    password: "Str0ngPass!",
    ...overrides,
  });

  const register = (body) => anon.post("/api/auth/register", { body });

  it("creates a student user and returns only safe fields", async () => {
    const body = registration();
    const res = await register(body);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.message, "Student registration successful");
    assert.equal(res.body.user.email, body.email);
    assert.equal(res.body.user.role, "STUDENT");
    assert.equal(res.body.user.status, "ACTIVE");
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.accessToken, undefined);
    assert.equal(res.body.refreshToken, undefined);
    assert.equal(res.body.tabContext, undefined);

    // No session is created, so registration must not sign the caller in.
    assert.equal(res.headers.getSetCookie().length, 0);

    const stored = await db.User.findOne({ where: { email: body.email } });

    assert.ok(stored, "no user row was created");
    assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
    assert.notEqual(stored.passwordHash, body.password);

    const profile = await db.Student.findOne({ where: { userId: stored.id } });
    assert.equal(profile, null, "student profile must not be created at registration");

    const enrollments = await db.Enrollment.count({ where: { studentId: stored.id } });
    assert.equal(enrollments, 0, "no enrollment row was created");
  });

  it("can sign in afterwards and has student access", async () => {
    const body = registration();
    await register(body);

    const client = createClient(baseUrl);
    const signedIn = await client.post("/api/auth/login", {
      body: { email: body.email, password: body.password },
    });

    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.user.role, "STUDENT");

    client.setToken(signedIn.body.accessToken);

    assert.equal((await client.get("/api/courses/catalog")).status, 200);
    assert.equal((await client.get("/api/users/me")).body.user.role, "STUDENT");

    // Newly registered user with no Student record receives empty enrollments without error
    const myEnrollments = await client.get("/api/enrollments/me");
    assert.equal(myEnrollments.status, 200);
    assert.deepEqual(myEnrollments.body.enrollments, []);
  });

  it("normalizes the email the way login does", async () => {
    const email = `mixed.case.${crypto.randomUUID()}@test.local`;
    const res = await register(
      registration({ email: `  ${email.toUpperCase()}  ` })
    );

    assert.equal(res.status, 201);

    const stored = await db.User.findOne({ where: { email } });

    assert.ok(stored, "the email was not stored lower-cased and trimmed");
    assert.equal(stored.email, email);

    // And the same address in any casing is now a conflict.
    const again = await register(registration({ email: email.toUpperCase() }));

    assert.equal(again.status, 409);
    assert.equal(again.body.message, "Email is already registered");
  });

  it("rejects a duplicate email", async () => {
    const body = registration();

    assert.equal((await register(body)).status, 201);

    const duplicate = await register(body);

    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "Email is already registered");
  });

  it("lets only one of two concurrent registrations of the same email win", async () => {
    const body = registration();

    const [first, second] = await Promise.all([
      register(body),
      register(body),
    ]);

    const statuses = [first.status, second.status].sort();

    assert.deepEqual(
      statuses,
      [201, 409],
      `expected one winner and one conflict, got ${first.status} and ${second.status}`
    );

    // The losing request must not have left a partial account behind.
    assert.equal(await db.User.count({ where: { email: body.email } }), 1);
  });

  it("rejects missing or invalid input", async () => {
    const cases = [
      [{ name: undefined }, "name is required"],
      [{ email: undefined }, "email is required"],
      [{ password: undefined }, "password is required"],
      [{ email: "not-an-email" }, "email must be a valid email address"],
      [{ password: "short" }, "password must be at least 8 characters"],
      [{ password: "x".repeat(73) }, "password must be at most 72 characters"],
      [{ name: "x".repeat(256) }, "name must be at most 255 characters"],
    ];

    for (const [overrides, message] of cases) {
      resetRateLimits();

      const res = await register(registration(overrides));

      assert.equal(
        res.status,
        400,
        `${JSON.stringify(overrides)} returned ${JSON.stringify(res.body)}`
      );
      assert.equal(res.body.message, message);
    }
  });

  it("refuses to let the client set a role, a status or a profile field", async () => {
    const privileged = {
      role: "ADMIN",
      roleId: 1,
      status: "ACTIVE",
      isActive: true,
      studentCode: "STU99999",
      admissionDate: "2020-01-01",
      passwordHash: "not-a-hash",
      permissions: ["USER_CREATE"],
    };

    for (const [field, value] of Object.entries(privileged)) {
      resetRateLimits();

      const res = await register(registration({ [field]: value }));

      assert.equal(
        res.status,
        400,
        `${field} was accepted: ${JSON.stringify(res.body)}`
      );
      assert.equal(res.body.message, `${field} is not accepted by this endpoint`);
      // Refused, not ignored: nothing may have been created.
      assert.equal(res.body.user, undefined);
    }
  });

  it("has no request shape that produces an admin or an instructor", async () => {
    const privilegedCount = async () => {
      const [rows] = await db.sequelize.query(`
        SELECT COUNT(*)::int AS n
        FROM "Users" u JOIN "Roles" r ON r.id = u."roleId"
        WHERE r.name <> 'STUDENT';
      `);

      return rows[0].n;
    };

    const before = await privilegedCount();

    const shapes = [
      { role: "SUPER_ADMIN" },
      { role: "ADMIN" },
      { role: "INSTRUCTOR" },
      { roleId: 1 },
      { role: "STUDENT", roleId: 1 },
    ];

    for (const overrides of shapes) {
      resetRateLimits();

      const res = await register(registration(overrides));

      assert.equal(res.status, 400, JSON.stringify(res.body));
    }

    assert.equal(await privilegedCount(), before);

    // The endpoint's own output is always a student, whatever is sent.
    resetRateLimits();

    const created = await register(registration());

    assert.equal(created.status, 201);
    assert.equal(created.body.user.role, "STUDENT");
  });

  it("first valid enrollment creates the student profile and enrollment atomically", async () => {
    const reg = registration();
    await register(reg);

    const client = createClient(baseUrl);
    const loginRes = await client.post("/api/auth/login", {
      body: { email: reg.email, password: reg.password },
    });
    assert.equal(loginRes.status, 200);
    client.setToken(loginRes.body.accessToken);

    const enrollRes = await client.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE101,
        semesterId: fixtures.semesterId.Fall,
      },
    });
    assert.equal(enrollRes.status, 201);
    assert.equal(enrollRes.body.enrollment.status, "ACTIVE");

    const user = await db.User.findOne({ where: { email: reg.email } });
    const student = await db.Student.findOne({ where: { userId: user.id } });
    assert.ok(student, "student profile should have been created on first enrollment");
    assert.equal(String(student.departmentId), String(fixtures.departmentId));
    assert.equal(student.studentCode, `STU${String(user.id).padStart(5, "0")}`);
  });

  it("enrollment failure rolls back student profile creation", async () => {
    const reg = registration();
    await register(reg);

    const client = createClient(baseUrl);
    const loginRes = await client.post("/api/auth/login", {
      body: { email: reg.email, password: reg.password },
    });
    client.setToken(loginRes.body.accessToken);

    // Try enrolling in non-open semester Spring
    const enrollRes = await client.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE101,
        semesterId: fixtures.semesterId.Spring,
      },
    });
    assert.equal(enrollRes.status, 400);

    const user = await db.User.findOne({ where: { email: reg.email } });
    const student = await db.Student.findOne({ where: { userId: user.id } });
    assert.equal(student, null, "student profile must be rolled back on enrollment failure");
  });

  it("second enrollment reuses the existing student profile", async () => {
    const reg = registration();
    await register(reg);

    const client = createClient(baseUrl);
    const loginRes = await client.post("/api/auth/login", {
      body: { email: reg.email, password: reg.password },
    });
    client.setToken(loginRes.body.accessToken);

    // First enrollment
    const first = await client.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE101,
        semesterId: fixtures.semesterId.Fall,
      },
    });
    assert.equal(first.status, 201);

    const user = await db.User.findOne({ where: { email: reg.email } });
    const studentBefore = await db.Student.findOne({ where: { userId: user.id } });

    // Second enrollment in different course
    const second = await client.post("/api/enrollments/me", {
      body: {
        courseId: fixtures.courseId.CSE201,
        semesterId: fixtures.semesterId.Fall,
      },
    });
    assert.equal(second.status, 201);

    const studentCount = await db.Student.count({ where: { userId: user.id } });
    assert.equal(studentCount, 1, "should not create duplicate student profiles");
    assert.equal(second.body.enrollment.studentId, studentBefore.id);
  });

  it("allows anonymous visitors to browse public courses and course details", async () => {
    const listRes = await anon.get("/api/courses/public");
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.courses));
    assert.ok(listRes.body.courses.length > 0);
    assert.ok(listRes.body.courses.every((c) => c.isActive === true));
    assert.ok(listRes.body.courses[0].department?.name);

    const courseId = listRes.body.courses[0].id;
    const detailRes = await anon.get(`/api/courses/public/${courseId}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.course.id, courseId);
    assert.ok(detailRes.body.course.department?.name);

    // Anonymous cannot enroll
    const enrollAttempt = await anon.post("/api/enrollments/me", {
      body: { courseId, semesterId: fixtures.semesterId.Fall },
    });
    assert.equal(enrollAttempt.status, 401);
  });

  it("throttles repeated registration attempts", async () => {
    resetRateLimits();

    let last = null;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      last = await register(registration());
    }

    assert.equal(last.status, 429);
    assert.equal(
      last.body.message,
      "Too many registration attempts. Try again later."
    );

    resetRateLimits();

    const recovered = await register(registration());

    assert.equal(recovered.status, 201);
  });
});

describe("tab-isolated sessions", () => {
  /*
   * A dedicated account, because signing in this many times would push the
   * fixture users past the per-user session cap and revoke sessions other
   * suites are still using.
   */
  const account = {
    email: `tab.user.${crypto.randomUUID()}@test.local`,
    password: "Str0ngPass!",
  };

  before(async () => {
    const res = await anon.post("/api/auth/register", {
      body: {
        name: "Tab User",
        email: account.email,
        password: account.password,
      },
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  const signIn = async () => {
    const client = createClient(baseUrl);
    const res = await client.post("/api/auth/login", {
      body: { email: account.email, password: account.password },
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));

    client.setToken(res.body.accessToken);

    return { client, tabContext: res.body.tabContext };
  };

  it("gives two tabs of one user separate sessions and cookies", async () => {
    const a = await signIn();
    const b = await signIn();

    assert.notEqual(a.tabContext, b.tabContext);
    assert.notEqual(
      a.client.cookies.get(cookieNameFor(a.tabContext)),
      b.client.cookies.get(cookieNameFor(b.tabContext))
    );

    // Each tab holds only its own cookie; neither overwrote the other.
    assert.equal(a.client.cookies.has(cookieNameFor(b.tabContext)), false);
    assert.equal(b.client.cookies.has(cookieNameFor(a.tabContext)), false);
  });

  it("refreshing one tab leaves the other tab's session alone", async () => {
    const a = await signIn();
    const b = await signIn();

    const refreshed = await refreshTab(a.client, a.tabContext);

    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.tabContext, a.tabContext);

    // B never rotated, so its original credential is still the live one.
    const untouched = await refreshTab(b.client, b.tabContext);

    assert.equal(untouched.status, 200);
    assert.equal(untouched.body.tabContext, b.tabContext);
  });

  it("logging out of one tab leaves the other tab signed in", async () => {
    const a = await signIn();
    const b = await signIn();

    assert.equal((await logoutTab(a.client, a.tabContext)).status, 200);

    // B still has both its access token and its refresh credential.
    assert.equal((await b.client.get("/api/users/me")).status, 200);
    assert.equal((await refreshTab(b.client, b.tabContext)).status, 200);

    // A lost both: its session is gone, so even its access token is refused.
    assert.equal((await a.client.get("/api/users/me")).status, 401);
    assert.equal((await refreshTab(a.client, a.tabContext)).status, 401);
  });

  it("refuses to refresh without a tab context", async () => {
    const a = await signIn();

    // The cookie is present, but nothing names it.
    const noHeader = await a.client.post("/api/auth/refresh");

    assert.equal(noHeader.status, 401);
    assert.equal(noHeader.body.message, "Tab context missing or invalid");
  });

  it("refuses a context that is not a UUID", async () => {
    const a = await signIn();
    const res = await a.client.post("/api/auth/refresh", {
      headers: { "X-Tab-Context": "../../etc/passwd" },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Tab context missing or invalid");
  });

  it("refuses a foreign context even when a live cookie is present", async () => {
    const a = await signIn();
    const b = await signIn();

    // A client holding B's real cookie but asking for A's context gets nothing:
    // the context selects the cookie, it does not stand in for one.
    const res = await refreshTab(b.client, crypto.randomUUID());

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Refresh token missing");

    // And guessing A's context while holding A's cookie under the wrong name
    // fails too.
    const forged = createClient(baseUrl);
    forged.cookies.set(
      cookieNameFor(a.tabContext),
      b.client.cookies.get(cookieNameFor(b.tabContext))
    );

    const forgedRes = await refreshTab(forged, a.tabContext);

    assert.equal(forgedRes.status, 401);
    assert.equal(forgedRes.body.message, "Invalid or expired refresh token");

    // Neither real session was harmed by the attempts.
    assert.equal((await refreshTab(a.client, a.tabContext)).status, 200);
    assert.equal((await refreshTab(b.client, b.tabContext)).status, 200);
  });

  it("reads only the cookie named for the requested tab", async () => {
    const a = await signIn();
    const b = await signIn();

    // One jar, both tabs' cookies, as a real browser would have.
    const both = createClient(baseUrl);
    both.cookies.set(
      cookieNameFor(a.tabContext),
      a.client.cookies.get(cookieNameFor(a.tabContext))
    );
    both.cookies.set(
      cookieNameFor(b.tabContext),
      b.client.cookies.get(cookieNameFor(b.tabContext))
    );

    const refreshedA = await refreshTab(both, a.tabContext);

    assert.equal(refreshedA.status, 200);
    assert.equal(refreshedA.body.tabContext, a.tabContext);

    // Rotating A rewrote only A's cookie.
    const refreshedB = await refreshTab(both, b.tabContext);

    assert.equal(refreshedB.status, 200);
    assert.equal(refreshedB.body.tabContext, b.tabContext);

    // The context is matched case-insensitively, so a client that upper-cases
    // it still reaches its own session instead of a confusing 401.
    const upper = await refreshTab(both, b.tabContext.toUpperCase());

    assert.equal(upper.status, 200);
    assert.equal(upper.body.tabContext, b.tabContext);
  });

  it("rejects an access token sent with another tab's context", async () => {
    const a = await signIn();
    const b = await signIn();

    const mine = await a.client.get("/api/users/me", {
      headers: { "X-Tab-Context": a.tabContext },
    });

    assert.equal(mine.status, 200);

    // The header is optional, so its absence is fine.
    assert.equal((await a.client.get("/api/users/me")).status, 200);

    const borrowed = await a.client.get("/api/users/me", {
      headers: { "X-Tab-Context": b.tabContext },
    });

    assert.equal(borrowed.status, 401);
    assert.equal(
      borrowed.body.message,
      "Tab context does not match the access token"
    );
  });

  it("lets two tabs refresh at the same time", async () => {
    const a = await signIn();
    const b = await signIn();

    const [refreshedA, refreshedB] = await Promise.all([
      refreshTab(a.client, a.tabContext),
      refreshTab(b.client, b.tabContext),
    ]);

    assert.equal(refreshedA.status, 200, JSON.stringify(refreshedA.body));
    assert.equal(refreshedB.status, 200, JSON.stringify(refreshedB.body));
  });

  it("lets only one of two simultaneous refreshes of the same tab succeed", async () => {
    const a = await signIn();

    const [first, second] = await Promise.all([
      refreshTab(a.client, a.tabContext),
      refreshTab(a.client, a.tabContext),
    ]);

    // Both requests carried the same credential, so exactly one rotation won
    // and the other presented a value that was already spent.
    const statuses = [first.status, second.status].sort((x, y) => x - y);

    assert.deepEqual(
      statuses,
      [200, 401],
      `expected one winner, got ${first.status} and ${second.status}`
    );

    const winner = first.status === 200 ? first : second;

    assert.ok(winner.body.accessToken);
  });

  it("refuses an expired session's cookie and access token", async () => {
    const a = await signIn();

    await db.UserSession.update(
      { expiresAt: new Date(Date.now() - 1_000) },
      { where: { tabContext: a.tabContext } }
    );

    const refreshed = await refreshTab(a.client, a.tabContext);

    assert.equal(refreshed.status, 401);
    assert.equal(refreshed.body.message, "Invalid or expired refresh token");

    const request = await a.client.get("/api/users/me");

    assert.equal(request.status, 401);
    assert.equal(request.body.message, "Invalid or expired access token");
  });

  it("cleans up expired sessions and enforces the session cap on login", async () => {
    const maxSessions = Number(process.env.MAX_ACTIVE_SESSIONS_PER_USER) || 20;
    const extra = 5;

    /*
     * These are inserted before the login, so the login's own session is one
     * more on top: the number dropped is `extra` plus the new one.
     */
    const expectedRevoked = extra + 1;

    const [hashes] = await db.sequelize.query(
      `SELECT "passwordHash" FROM "Users" WHERE "email" = :email`,
      { replacements: { email: EMAILS.student } }
    );
    const role = await db.Role.findOne({ where: { name: "STUDENT" } });

    const user = await db.User.create({
      name: "Session Cap User",
      email: `cap.${crypto.randomUUID()}@test.local`,
      // Reused so this test does not pay for another bcrypt hash.
      passwordHash: hashes[0].passwordHash,
      roleId: role.id,
      status: "ACTIVE",
    });

    const session = (expiresAt, tag) => ({
      userId: user.id,
      refreshTokenHash: randomBytes(32).toString("hex"),
      tabContext: crypto.randomUUID(),
      expiresAt,
      userAgent: tag,
    });

    const live = Array.from({ length: maxSessions + extra }, (_, index) =>
      session(new Date(Date.now() + 86_400_000), `live-${index}`)
    );

    await db.UserSession.bulkCreate([
      ...live,
      session(new Date(Date.now() - 86_400_000), "stale-1"),
      session(new Date(Date.now() - 86_400_000), "stale-2"),
    ]);

    const client = createClient(baseUrl);
    const signedIn = await client.post("/api/auth/login", {
      body: { email: user.email, password: PASSWORD },
    });

    assert.equal(signedIn.status, 200);

    const [counts] = await db.sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE "expiresAt" < NOW())::int AS expired,
         COUNT(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" > NOW())::int AS live
       FROM "User_Sessions" WHERE "userId" = :userId;`,
      { replacements: { userId: user.id } }
    );

    // Expired rows are deleted outright; the rest are capped.
    assert.equal(counts[0].expired, 0);
    assert.equal(counts[0].live, maxSessions);

    // The oldest sessions were the ones dropped, and the browser is told to
    // forget their cookies — it cannot tell they are gone.
    const rows = await db.UserSession.findAll({
      where: { userId: user.id },
      order: [["id", "ASC"]],
    });

    const revoked = rows.filter((row) => row.revokedAt !== null);

    assert.deepEqual(
      revoked.map((row) => row.id),
      rows.slice(0, expectedRevoked).map((row) => row.id)
    );

    const setCookies = signedIn.headers.getSetCookie();
    const cleared = setCookies.filter((cookie) => cookie.includes("=; "));

    assert.equal(cleared.length, expectedRevoked);
    assert.equal(setCookies.length - cleared.length, 1);

    // The session that was just created is usable.
    assert.equal(
      (
        await refreshTab(client, signedIn.body.tabContext)
      ).status,
      200
    );
  });

  it("revokes nothing when logout arrives without a tab context", async () => {
    const a = await signIn();

    const noHeader = await anon.post("/api/auth/logout");

    assert.equal(noHeader.status, 200);

    const foreignContext = await anon.post("/api/auth/logout", {
      headers: { "X-Tab-Context": a.tabContext },
    });

    assert.equal(foreignContext.status, 200);

    // A context with no matching cookie revokes nothing: the session survives.
    assert.equal((await refreshTab(a.client, a.tabContext)).status, 200);
  });
});

describe("POST /api/auth/change-password & PUT /api/users/me/password", () => {
  it("rejects unauthenticated requests", async () => {
    const unauthed = await anon.post("/api/auth/change-password", {
      body: { currentPassword: PASSWORD, newPassword: "NewSecretPassword123" },
    });
    assert.equal(unauthed.status, 401);

    const unauthedPut = await anon.put("/api/users/me/password", {
      body: { currentPassword: PASSWORD, newPassword: "NewSecretPassword123" },
    });
    assert.equal(unauthedPut.status, 401);
  });

  it("rejects missing or invalid inputs", async () => {
    const res = await student.post("/api/auth/change-password", {
      body: { currentPassword: "", newPassword: "Short" },
    });
    assert.equal(res.status, 400);

    const res2 = await student.post("/api/auth/change-password", {
      body: { currentPassword: PASSWORD, newPassword: "Short" },
    });
    assert.equal(res2.status, 400);
    assert.match(res2.body.message, /at least 8 characters/i);
  });

  it("rejects incorrect current password", async () => {
    const res = await student.post("/api/auth/change-password", {
      body: { currentPassword: "WrongPassword123", newPassword: "NewSecretPassword123" },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /incorrect/i);
  });

  it("rejects new password matching current password", async () => {
    const res = await student.post("/api/auth/change-password", {
      body: { currentPassword: PASSWORD, newPassword: PASSWORD },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /different/i);
  });

  it("updates password and allows login with the new password", async () => {
    // Create a temporary student user through registration
    const tempEmail = `pwdchange_${Date.now()}@test.edu`;
    const regRes = await anon.post("/api/auth/register", {
      body: {
        name: "Password Change Test",
        email: tempEmail,
        password: "InitialPassword123",
      },
    });
    assert.equal(regRes.status, 201);

    // Login with initial password
    const tempClient = createClient(baseUrl);
    const loginRes = await tempClient.post("/api/auth/login", {
      body: { email: tempEmail, password: "InitialPassword123" },
    });
    assert.equal(loginRes.status, 200);
    tempClient.setToken(loginRes.body.accessToken);

    // Change password via POST /api/auth/change-password
    const changeRes = await tempClient.post("/api/auth/change-password", {
      body: {
        currentPassword: "InitialPassword123",
        newPassword: "BrandNewPassword456",
      },
    });
    assert.equal(changeRes.status, 200);
    assert.match(changeRes.body.message, /success/i);

    // Old password should now fail
    const oldLoginRes = await anon.post("/api/auth/login", {
      body: { email: tempEmail, password: "InitialPassword123" },
    });
    assert.equal(oldLoginRes.status, 401);

    // New password succeeds
    const newLoginRes = await anon.post("/api/auth/login", {
      body: { email: tempEmail, password: "BrandNewPassword456" },
    });
    assert.equal(newLoginRes.status, 200);

    // Also test PUT /api/users/me/password
    const tempClient2 = createClient(baseUrl);
    tempClient2.setToken(newLoginRes.body.accessToken);
    const changeRes2 = await tempClient2.put("/api/users/me/password", {
      body: {
        currentPassword: "BrandNewPassword456",
        newPassword: "FinalPassword789",
      },
    });
    assert.equal(changeRes2.status, 200);

    // Login with FinalPassword789 succeeds
    const finalLoginRes = await anon.post("/api/auth/login", {
      body: { email: tempEmail, password: "FinalPassword789" },
    });
    assert.equal(finalLoginRes.status, 200);
  });
});

