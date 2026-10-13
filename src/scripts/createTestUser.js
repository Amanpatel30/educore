import "dotenv/config";

import db from "../../models/index.js";
import { hashPassword } from "../utils/password.js";

const { User, Role } = db;

/*
 * The password is not stored in source. Set SEED_USER_PASSWORD in .env, which
 * is git-ignored, and rotate it if it was ever committed.
 */
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD;

const createTestUser = async () => {
  try {
    if (!SEED_PASSWORD) {
      throw new Error(
        "SEED_USER_PASSWORD is not set. Add it to .env (see .env.example)."
      );
    }

    await db.sequelize.authenticate();

    // Users reference a role by id, not by name.
    const role = await Role.findOne({ where: { name: "STUDENT" } });

    if (!role) {
      throw new Error(
        'Role "STUDENT" not found. Seed the Roles table first.'
      );
    }

    const passwordHash = await hashPassword(SEED_PASSWORD);

    const user = await User.create({
      name: "Aman",
      email: process.env.SEED_USER_EMAIL || "aman@gmail.com",
      passwordHash,
      roleId: role.id,
      status: "ACTIVE",
    });

    console.log("User created:");
    console.log({
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
    });
  } catch (error) {
    console.error("Failed to create user:", error.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
};

createTestUser();
