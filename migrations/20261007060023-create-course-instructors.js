'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
      await queryInterface.createTable("Course_Instructors", {
    id: {
      type: Sequelize.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
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

    instructorId: {
      type: Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: "Instructors",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },

    assignedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
});

  await queryInterface.addIndex(
    "Course_Instructors",
    ["courseId", "instructorId"],
    {
      unique: true,
      name: "course_instructors_course_id_instructor_id_unique",
    }
  );
  
  },

  async down (queryInterface, Sequelize) {
   await queryInterface.dropTable("Course_Instructors");
  }
};
