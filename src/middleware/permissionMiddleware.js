import db from "../../models/index.js";

const { RolePermission, Permission } = db;

export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.roleId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const rolePermission = await RolePermission.findOne({
        where: {
          roleId: req.user.roleId,
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

      if (!rolePermission) {
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