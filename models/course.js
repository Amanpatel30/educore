import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Course extends Model {
    static associate(models) {
      // Course belongs to Department
      Course.belongsTo(models.Department, {
        foreignKey: "departmentId",
        as: "department",
      });

      // Course has many Enrollments
      Course.hasMany(models.Enrollment, {
        foreignKey: "courseId",
        as: "enrollments",
      });
      
      Course.belongsToMany(models.Instructor, {
        through: models.CourseInstructor,
        foreignKey: "courseId",
        otherKey: "instructorId",
        as: "instructors",
      });
    }
  }

  Course.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      departmentId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Departments",
          key: "id",
        },
      },

      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      credits: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "Course",
      tableName: "Courses",
      timestamps: true,
    }
  );

  return Course;
};