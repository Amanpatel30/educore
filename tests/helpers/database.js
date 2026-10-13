import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

const SEQUELIZE_CLI = path.join(
  "node_modules",
  "sequelize-cli",
  "lib",
  "sequelize"
);

const BOOTSTRAP = path.join("src", "scripts", "bootstrapRbac.js");

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run the test harness with NODE_ENV=production.");
}

/*
 * Every destructive statement in this file goes through here first, so a
 * mistyped or copied URL can never drop a shared or production database. The
 * only thing that qualifies a database as disposable is its name.
 */
const assertSafeTarget = (name) => {
  if (!name || !/test/i.test(name)) {
    throw new Error(
      `Refusing to create or drop database "${name}": a disposable database ` +
        `must have "test" in its name. Check TEST_DATABASE_URL and DATABASE_URL.`
    );
  }
};

/*
 * TEST_DATABASE_URL is the explicit target and is used verbatim. Without it we
 * derive a unique name from DATABASE_URL so a plain `npm test` works and
 * concurrent runs do not collide.
 */
export const resolveTestDatabase = () => {
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    const name = url.pathname.slice(1);
    assertSafeTarget(name);
    return { name, url: process.env.TEST_DATABASE_URL };
  }

  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error(
      "Set TEST_DATABASE_URL to the database the tests may use, or set " +
        "DATABASE_URL so one can be derived from it."
    );
  }

  const url = new URL(base);
  const name = `${url.pathname.slice(1)}_test_${process.pid}`;
  assertSafeTarget(name);
  url.pathname = `/${name}`;

  return { name, url: url.toString() };
};

/*
 * Administrative connections go through the maintenance database so that the
 * database being dropped is never the one we are connected to.
 */
const maintenanceUrl = () => {
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!base) {
    throw new Error("Set TEST_DATABASE_URL or DATABASE_URL.");
  }

  const url = new URL(base);
  url.pathname = "/postgres";
  return url.toString();
};

export const createTestDatabase = async () => {
  const { name, url } = resolveTestDatabase();

  const admin = new Client({ connectionString: maintenanceUrl() });
  await admin.connect();

  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  return { name, url };
};

export const migrate = (url) => {
  execFileSync(
    process.execPath,
    [SEQUELIZE_CLI, "db:migrate"],
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    }
  );
};

/*
 * Runs the same RBAC bootstrap the deployment uses, as a child process against
 * the test database. Roles and permissions are reference data outside
 * migrations, so this is what makes the test database usable at all.
 */
export const bootstrap = (url) => {
  execFileSync(process.execPath, [BOOTSTRAP], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
};

export const dropTestDatabase = async (name) => {
  assertSafeTarget(name);

  const admin = new Client({ connectionString: maintenanceUrl() });
  await admin.connect();

  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};
