"use strict";

/*
 * Tab-isolated sessions: one session row per browser tab.
 *
 * A browser shares one cookie jar across every tab, so a single refresh cookie
 * could not represent two simultaneous sessions. Each session now carries an
 * opaque context generated at login; the client returns it in a header and the
 * server uses it to decide which cookie to read.
 *
 * Existing rows are backfilled with a random opaque value that is not a UUID.
 * The cookie those sessions were issued under ("refreshToken") is no longer
 * read, so they are already unreachable and expire within the refresh lifetime;
 * the backfill exists only so the NOT NULL constraint can be applied without
 * inventing a session. backfill: replace with a UUID generator if these rows
 * ever need to be reachable.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("User_Sessions", "tabContext", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "User_Sessions"
        SET "tabContext" = md5(random()::text || clock_timestamp()::text || id::text)
        WHERE "tabContext" IS NULL;
    `);

    await queryInterface.changeColumn("User_Sessions", "tabContext", {
      type: Sequelize.STRING(64),
      allowNull: false,
    });

    /*
     * Unique so that two live sessions can never answer to the same context,
     * which would make the server read one tab's cookie for another tab's
     * request.
     */
    await queryInterface.addIndex("User_Sessions", ["tabContext"], {
      unique: true,
      name: "User_Sessions_tabContext_key",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "User_Sessions",
      "User_Sessions_tabContext_key"
    );

    await queryInterface.removeColumn("User_Sessions", "tabContext");
  },
};
