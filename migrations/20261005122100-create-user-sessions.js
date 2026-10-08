"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("User_Sessions", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      userId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Users",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      refreshTokenHash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      revokedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      lastUsedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      ipAddress: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },

      userAgent: {
        type: Sequelize.TEXT,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("User_Sessions");
  },
};