import express from "express";

import {
  getRolesController,
  updateRolePermissionsController,
} from "../controllers/roleController.js";

import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { numericParams } from "../middleware/validateParams.js";

const router = express.Router();

numericParams(router, "id");

/*
 * Reading roles needs the same permission as listing users: both are the shape
 * of the user-administration screen. Changing a role's grants is stricter.
 */
router.get(
  "/",
  authenticate,
  requirePermission("USER_VIEW_ALL"),
  getRolesController
);

router.put(
  "/:id/permissions",
  authenticate,
  requirePermission("PERMISSION_ASSIGN"),
  updateRolePermissionsController
);

export default router;
