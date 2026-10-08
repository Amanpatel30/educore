"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Add new roleId column temporarily nullable
      await queryInterface.addColumn(
        "Users",
        "roleId",
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          references: {
            model: "Roles",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction }
      );

      // 2. Convert existing role names into role IDs
      await queryInterface.sequelize.query(
        `
        UPDATE "Users" AS u
        SET "roleId" = r."id"
        FROM "Roles" AS r
        WHERE u."role" = r."name";
        `,
        { transaction }
      );

      // 3. Make sure every existing user got a roleId
      const [rows] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "Users"
        WHERE "roleId" IS NULL;
        `,
        { transaction }
      );

      if (rows[0].count > 0) {
        throw new Error(
          "Some Users could not be mapped from role to roleId."
        );
      }

      // 4. Old FK: Users.role -> Roles.name
      await queryInterface.removeConstraint(
        "Users",
        "Users_role_fkey",
        { transaction }
      );

      // 5. Make roleId mandatory
      await queryInterface.changeColumn(
        "Users",
        "roleId",
        {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: {
            model: "Roles",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction }
      );

      // 6. Remove old role column
      await queryInterface.removeColumn(
        "Users",
        "role",
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Re-create old role column
      await queryInterface.addColumn(
        "Users",
        "role",
        {
          type: Sequelize.STRING,
          allowNull: true,
          references: {
            model: "Roles",
            key: "name",
          },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction }
      );

      // 2. Convert roleId back to role name
      await queryInterface.sequelize.query(
        `
        UPDATE "Users" AS u
        SET "role" = r."name"
        FROM "Roles" AS r
        WHERE u."roleId" = r."id";
        `,
        { transaction }
      );

      // 3. Verify conversion
      const [rows] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "Users"
        WHERE "role" IS NULL;
        `,
        { transaction }
      );

      if (rows[0].count > 0) {
        throw new Error(
          "Some Users could not be converted back to role."
        );
      }

      // 4. Make old role mandatory
      await queryInterface.changeColumn(
        "Users",
        "role",
        {
          type: Sequelize.STRING,
          allowNull: false,
          references: {
            model: "Roles",
            key: "name",
          },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction }
      );

      // 5. Remove roleId
      await queryInterface.removeColumn(
        "Users",
        "roleId",
        { transaction }
      );
    });
  },
};