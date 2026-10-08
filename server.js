import "dotenv/config";

import app from "./src/app.js";
import db from "./models/index.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await db.sequelize.authenticate();

    console.log("Database connected successfully.");

    app.listen(PORT, () => {
      console.log(
        `EduCore server running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
};

startServer();