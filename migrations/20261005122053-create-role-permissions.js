"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Role_Permissions", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      roleId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Roles",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      permissionId: {
        type: Sequelize.BIGINT,
        allowNull: false,

        references: {
          model: "Permissions",
          key: "id",
        },

        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    });

    await queryInterface.addConstraint("Role_Permissions", {
      fields: ["roleId", "permissionId"],
      type: "unique",
      name: "unique_role_permission",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Role_Permissions");
  },
};