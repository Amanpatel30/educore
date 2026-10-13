import express from "express";

import {
  createUserController,
  getCurrentUserController,
  getUserByIdController,
  getUsersController,
  updateUserController,
} from "../controllers/userController.js";
import { changePassword } from "../controllers/authController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id");

/*
 * /me is declared first: Express matches in order, and "me" is not an id.
 */
router.get("/me", authenticate, getCurrentUserController);
router.put("/me/password", authenticate, changePassword);

router.get(
  "/",
  authenticate,
  requirePermission("USER_VIEW_ALL"),
  getUsersController
);

router.post(
  "/",
  authenticate,
  requirePermission("USER_CREATE_UPDATE_DISABLE"),
  createUserController
);

router.get(
  "/:id",
  authenticate,
  requirePermission("USER_VIEW_ALL"),
  getUserByIdController
);

router.put(
  "/:id",
  authenticate,
  requirePermission("USER_CREATE_UPDATE_DISABLE"),
  updateUserController
);

export default router;
