"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Enrollments", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      studentId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Students",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      courseId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Courses",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      semesterId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Semesters",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      enrollmentDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "ACTIVE",
      },

      grade: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      droppedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addConstraint("Enrollments", {
      fields: ["studentId", "courseId", "semesterId"],
      type: "unique",
      name: "unique_student_course_semester",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Enrollments");
  },
};