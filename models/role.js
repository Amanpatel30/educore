import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      // Role has many Users
      Role.hasMany(models.User, {
        foreignKey: "roleId",
        sourceKey: "id",
        as: "users",
      });

      // Role has many RolePermission records
      Role.hasMany(models.RolePermission, {
        foreignKey: "roleId",
        as: "rolePermissions",
      });

      // Role belongs to many Permissions
      Role.belongsToMany(models.Permission, {
        through: models.RolePermission,
        foreignKey: "roleId",
        otherKey: "permissionId",
        as: "permissions",
      });
    }
  }

  Role.init(
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
      modelName: "Role",
      tableName: "Roles",
      timestamps: true,
    }
  );

  return Role;
};