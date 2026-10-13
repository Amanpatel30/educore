import db from "../../models/index.js";

const { RolePermission, Permission } = db;

/*
 * Exported so a route whose response shape depends on the caller's permissions
 * can ask the same question the middleware asks, without a second stack of
 * middleware.
 */
export const roleHasPermission = async (roleId, permissionName) => {
  const rolePermission = await RolePermission.findOne({
    where: {
      roleId,
    },
    include: [
      {
        model: Permission,
        as: "permission",
        where: {
          name: permissionName,
        },
        attributes: [],
      },
    ],
  });

  return Boolean(rolePermission);
};

export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.roleId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      if (!(await roleHasPermission(req.user.roleId, permissionName))) {
        return res.status(403).json({
          message: "You do not have permission to perform this action",
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);

      return res.status(500).json({
        message: "Internal server error",
      });
    }
  };
};