import { getRoles } from "../services/role/getRolesService.js";
import { updateRolePermissions } from "../services/role/updateRolePermissionsService.js";
import { ok } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getRolesController = asyncHandler(async (req, res) => {
  const roles = await getRoles();

  return ok(res, { count: roles.length, roles });
});

export const updateRolePermissionsController = asyncHandler(
  async (req, res) => {
    const role = await updateRolePermissions({
      actorId: req.user.id,
      roleId: req.params.id,
      permissions: req.body.permissions,
    });

    return ok(res, { role }, "Role permissions updated successfully");
  }
);
