import { getAuditLogs } from "../services/audit/getAuditLogsService.js";
import { okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import { parseSearchQuery } from "../utils/query.js";

export const getAuditLogsController = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);

  const result = await getAuditLogs({
    pagination,
    operation: parseSearchQuery(req.query.operation),
  });

  return okList(res, "auditLogs", result, pagination);
});
