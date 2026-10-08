import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Permission extends Model {
    static associate(models) {
      // Permission has many RolePermission records
      Permission.hasMany(models.RolePermission, {
        foreignKey: "permissionId",
        as: "rolePermissions",
      });

      // Permission belongs to many Roles
      Permission.belongsToMany(models.Role, {
        through: models.RolePermission,
        foreignKey: "permissionId",
        otherKey: "roleId",
        as: "roles",
      });
    }
  }

  Permission.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Permission",
      tableName: "Permissions",
      timestamps: true,
    }
  );

  return Permission;
};