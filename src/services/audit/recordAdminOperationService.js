import db from "../../../models/index.js";

const { AdminOperation } = db;

/*
 * Written inside the caller's transaction, so a change and the record of who
 * made it commit or roll back together. An audit row that can outlive a rolled
 * back change is worse than no audit row.
 */
export const recordAdminOperation = async (
  { adminUserId, operation, targetType, targetId = null },
  transaction
) => {
  await AdminOperation.create(
    { adminUserId, operation, targetType, targetId },
    { transaction }
  );
};
