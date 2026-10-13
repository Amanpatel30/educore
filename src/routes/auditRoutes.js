import express from "express";

import { getAuditLogsController } from "../controllers/auditController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

/*
 * Read-only by design. Audit rows are written inside the transactions that make
 * the changes, so there is no endpoint that creates one.
 */
router.get(
  "/",
  authenticate,
  requirePermission("AUDIT_LOG_VIEW_ALLOWED"),
  getAuditLogsController
);

export default router;
