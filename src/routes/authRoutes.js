import express from "express";

import {
  login,
  refresh,
  logout,
  register,
} from "../controllers/authController.js";
import {
  loginRateLimit,
  registerRateLimit,
} from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/register", registerRateLimit, register);
router.post("/login", loginRateLimit, login);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;