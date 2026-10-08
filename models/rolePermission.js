import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class RolePermission extends Model {
    static associate(models) {
      // RolePermission belongs to Role
      RolePermission.belongsTo(models.Role, {
        foreignKey: "roleId",
        as: "role",
      });

      // RolePermission belongs to Permission
      RolePermission.belongsTo(models.Permission, {
        foreignKey: "permissionId",
        as: "permission",
      });
    }
  }

  RolePermission.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      roleId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Roles",
          key: "id",
        },
      },

      permissionId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Permissions",
          key: "id",
        },
      },
    },
    {
      sequelize,
      modelName: "RolePermission",
      tableName: "Role_Permissions",
      timestamps: false,

      indexes: [
        {
          unique: true,
          fields: ["roleId", "permissionId"],
        },
      ],
    }
  );

  return RolePermission;
};