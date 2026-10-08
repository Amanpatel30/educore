import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class CourseInstructor extends Model {
    static associate(models) {
      CourseInstructor.belongsTo(models.Course, {
        foreignKey: "courseId",
        as: "course",
      });

      CourseInstructor.belongsTo(models.Instructor, {
        foreignKey: "instructorId",
        as: "instructor",
      });
    }
  }
  
  CourseInstructor.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      courseId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Courses",
          key: "id",
        },
      },

      instructorId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "Instructors",
          key: "id",
        },
      },

      assignedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "CourseInstructor",
      tableName: "Course_Instructors",
      timestamps: false,

      indexes: [
        {
          unique: true,
          fields: ["courseId", "instructorId"],
        },
      ],
    }
  );

  return CourseInstructor;
};