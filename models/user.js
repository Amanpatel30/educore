import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // One User can have one Student profile
      User.hasOne(models.Student, {
        foreignKey: "userId",
        as: "student",
      });

      // One User can have one Instructor profile
      User.hasOne(models.Instructor, {
        foreignKey: "userId",
        as: "instructor",
      });

      // One Role can have many Users
      User.belongsTo(models.Role, {
        foreignKey: "roleId",
        as: "roleDetails",
      });

      // One User can have many active/past sessions
      User.hasMany(models.UserSession, {
        foreignKey: "userId",
        as: "sessions",
      });

      // One User can perform many admin operations
      User.hasMany(models.AdminOperation, {
        foreignKey: "adminUserId",
        as: "adminOperations",
      });
    }
  }

  User.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },

      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      roleId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Roles",
          key: "id",
        },
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ACTIVE",
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "Users",
      timestamps: true,
    }
  );

  return User;
};