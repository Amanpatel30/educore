import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Instructor extends Model {
    static associate(models) {
      // Instructor belongs to User
      Instructor.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
      });

      // Instructor belongs to Department
      Instructor.belongsTo(models.Department, {
        foreignKey: "departmentId",
        as: "department",
      });
      
      Instructor.belongsToMany(models.Course, {
        through: models.CourseInstructor,
        foreignKey: "instructorId",
        otherKey: "courseId",
        as: "courses",
      });
    }
  }

  Instructor.init(
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

      employeeCode: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      designation: {
        type: DataTypes.STRING,
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
      modelName: "Instructor",
      tableName: "Instructors",
      timestamps: true,
    }
  );

  return Instructor;
};