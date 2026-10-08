import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Student extends Model {
    static associate(models) {
      // Student belongs to User
      Student.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
      });

      // Student belongs to Department
      Student.belongsTo(models.Department, {
        foreignKey: "departmentId",
        as: "department",
      });

      // Student has many Enrollments
      Student.hasMany(models.Enrollment, {
        foreignKey: "studentId",
        as: "enrollments",
      });
    }
  }

  Student.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true,
        references: {
          model: "Users",
          key: "id",
        },
      },

      departmentId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Departments",
          key: "id",
        },
      },

      studentCode: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      admissionDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ACTIVE",
      },
    },
    {
      sequelize,
      modelName: "Student",
      tableName: "Students",
      timestamps: true,
    }
  );

  return Student;
};