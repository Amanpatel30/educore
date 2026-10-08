"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Admin_Operations", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      adminUserId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Users",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      operation: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      targetType: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      targetId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Admin_Operations");
  },
};