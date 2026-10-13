import "dotenv/config";

import app from "./src/app.js";
import db from "./models/index.js";

const PORT = process.env.PORT || 5000;

const REQUIRED_ENV = ["DATABASE_URL", "JWT_ACCESS_SECRET"];

/*
 * Fail before binding the port. A missing signing secret would otherwise only
 * surface as a 500 on the first login attempt.
 */
const assertConfig = () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.JWT_ACCESS_SECRET.length < 32
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET must be at least 32 characters in production."
    );
  }

  if (!Number.isInteger(Number(PORT)) || Number(PORT) <= 0) {
    throw new Error(`PORT must be a positive integer, got "${PORT}".`);
  }
};

const startServer = async () => {
  try {
    assertConfig();

    await db.sequelize.authenticate();

    console.log("Database connected successfully.");

    app.listen(PORT, () => {
      console.log(
        `EduCore server running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
};

startServer();
