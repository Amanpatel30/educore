"use strict";

/*
 * ADMIN already has COURSE_CREATE_UPDATE and COURSE_ASSIGN but was missing
 * COURSE_CATALOG_VIEW, so an admin could create a course and then get a 403
 * reading it back. This grants the read permission the admin write permission
 * already implies.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO "Role_Permissions" ("roleId", "permissionId")
      SELECT r."id", p."id"
      FROM "Roles" r, "Permissions" p
      WHERE r."name" = 'ADMIN'
        AND p."name" = 'COURSE_CATALOG_VIEW'
      ON CONFLICT ON CONSTRAINT unique_role_permission DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM "Role_Permissions" rp
      USING "Roles" r, "Permissions" p
      WHERE rp."roleId" = r."id"
        AND rp."permissionId" = p."id"
        AND r."name" = 'ADMIN'
        AND p."name" = 'COURSE_CATALOG_VIEW';
    `);
  },
};
