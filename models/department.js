import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Department extends Model {
    static associate(models) {
      // Department has many Students
      Department.hasMany(models.Student, {
        foreignKey: "departmentId",
        as: "students",
      });

      // Department has many Instructors
      Department.hasMany(models.Instructor, {
        foreignKey: "departmentId",
        as: "instructors",
      });

      // Department has many Courses
      Department.hasMany(models.Course, {
        foreignKey: "departmentId",
        as: "courses",
      });
    }
  }

  Department.init(
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

      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "Department",
      tableName: "Departments",
      timestamps: true,
    }
  );

  return Department;
};