import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class UserSession extends Model {
    static associate(models) {
      // Session belongs to User
      UserSession.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
      });
    }
  }

  UserSession.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },

      refreshTokenHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },

      tabContext: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },

      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },

      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "UserSession",
      tableName: "User_Sessions",
      timestamps: true,
    }
  );

  return UserSession;
};