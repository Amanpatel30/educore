import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class Semester extends Model {
    static associate(models) {
      // Semester has many Enrollments
      Semester.hasMany(models.Enrollment, {
        foreignKey: "semesterId",
        as: "enrollments",
      });
    }
  }

  Semester.init(
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

      academicYear: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "UPCOMING",
      },
    },
    {
      sequelize,
      modelName: "Semester",
      tableName: "Semesters",
      timestamps: true,
    }
  );

  return Semester;
};