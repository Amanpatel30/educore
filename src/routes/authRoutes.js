import express from "express";

import {
  login,
  refresh,
  logout,
  register,
  changePassword,
} from "../controllers/authController.js";
import {
  loginRateLimit,
  registerRateLimit,
} from "../middleware/rateLimit.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerRateLimit, register);
router.post("/login", loginRateLimit, login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/change-password", authenticate, changePassword);

export default router;