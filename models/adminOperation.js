import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class AdminOperation extends Model {
    static associate(models) {
      // Admin operation belongs to the user who performed it
      AdminOperation.belongsTo(models.User, {
        foreignKey: "adminUserId",
        as: "admin",
      });
    }
  }

  AdminOperation.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      adminUserId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },

      operation: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      targetType: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      targetId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AdminOperation",
      tableName: "Admin_Operations",
      timestamps: true,
      updatedAt: false,
    }
  );

  return AdminOperation;
};