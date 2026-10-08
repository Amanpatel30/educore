import "dotenv/config";

import db from "../../models/index.js";
import { hashPassword } from "../utils/password.js";

const { User } = db;

const createTestUser = async () => {
  try {
    await db.sequelize.authenticate();

    const passwordHash = await hashPassword("password123");

    const user = await User.create({
      name: "Aman",
      email: "aman@gmail.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });

    console.log("User created:");
    console.log({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Failed to create user:", error);
  } finally {
    await db.sequelize.close();
  }
};

createTestUser();