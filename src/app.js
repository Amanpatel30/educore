import express from "express";
import cookieParser from "cookie-parser";
import courseRoutes from "./routes/courseRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import semesterRoutes from "./routes/semesterRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import instructorRoutes from "./routes/instructorRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";

const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS || "http://localhost:3001"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

/*
 * CORS. The refresh token lives in an httpOnly cookie, so the browser will
 * only send it cross-origin when the response names the exact origin and sets
 * credentials to true. A wildcard would be rejected by the browser here.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Tab-Context"
    );
  }

  // Vary on Origin so a cache cannot serve one origin's headers to another.
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(cookieParser());

/*
 * Express 5 leaves req.body undefined when nothing was parsed (no body, or a
 * Content-Type other than JSON). Handlers destructure it, so a bodyless request
 * would raise a TypeError and answer 500 where 400 is the honest reply.
 */
app.use((req, res, next) => {
  if (req.body === undefined) {
    req.body = {};
  }

  next();
});

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
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/instructors", instructorRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/audit-logs", auditRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
