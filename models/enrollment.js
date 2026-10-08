import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Enrollment extends Model {
    static associate(models) {
      // Enrollment belongs to Student
      Enrollment.belongsTo(models.Student, {
        foreignKey: "studentId",
        as: "student",
      });

      // Enrollment belongs to Course
      Enrollment.belongsTo(models.Course, {
        foreignKey: "courseId",
        as: "course",
      });

      // Enrollment belongs to Semester
      Enrollment.belongsTo(models.Semester, {
        foreignKey: "semesterId",
        as: "semester",
      });
    }
  }

  Enrollment.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      studentId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Students",
          key: "id",
        },
      },

      courseId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Courses",
          key: "id",
        },
      },

      semesterId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Semesters",
          key: "id",
        },
      },

      enrollmentDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ACTIVE",
      },

      grade: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      droppedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Enrollment",
      tableName: "Enrollments",
      timestamps: true,

      indexes: [
        {
          unique: true,
          fields: ["studentId", "courseId", "semesterId"],
        },
      ],
    }
  );

  return Enrollment;
};