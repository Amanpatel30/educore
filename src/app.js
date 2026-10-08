import express from "express";
import cookieParser from "cookie-parser";
import courseRoutes from "./routes/courseRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { errorHandler } from "./middleware/errorMiddleware.js";
import semesterRoutes from "./routes/semesterRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";


const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
  });
});


app.use("/api/courses", courseRoutes);
app.use("/api/semesters", semesterRoutes);
app.use("/api/enrollments",enrollmentRoutes)


app.use(errorHandler);

export default app;