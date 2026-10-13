# EduCore — Migrations, Upgrade Paths, and Rollback Risk

## 1. Two-phase provisioning

Schema and reference data are owned by different mechanisms on purpose.

| Phase | Command | Owns |
|---|---|---|
| Migrations | `npm run migrate` | Tables, columns, constraints, the `create_enrollment` stored procedure |
| Bootstrap | `npm run bootstrap` | `Roles`, `Permissions`, and the `Role_Permissions` grants |

Both phases are safe to re-run. To do them in order:

```bash
npm run setup      # migrate, then bootstrap
```

The application is ESM (`"type": "module"`), but `sequelize-cli` loads migration
files with `require`. `migrations/package.json` therefore declares
`{"type": "commonjs"}` so migration files keep using `module.exports`/`require`
while the rest of the repository uses `import`/`export`.

### Why role data is not a migration

`Roles` and `Permissions` are reference data, not schema. Putting them in a
migration means every future permission addition needs a new migration file, and
a data migration that inserts rows can only work if the rows it depends on
already exist — which is exactly how `ADMIN` ended up missing
`COURSE_CATALOG_VIEW`. `src/scripts/bootstrapRbac.js` is now the single source of
truth for the matrix.

The bootstrap is idempotent by construction: every insert is guarded by
`NOT EXISTS`, so re-running it changes nothing. It never deletes. If a role has
grants the file does not mention, it warns and leaves them alone.

It also validates its own result. Fewer grants than the matrix means an insert
did not apply and the script exits non-zero; more means unmanaged drift, which is
reported as a warning.

## 2. Upgrading an existing database

Nothing here loses role assignments or user data. For a database that was
provisioned before the bootstrap existed (including this project's development
database):

```bash
npm run migrate:status   # confirm which migrations are applied
npm run migrate          # applies only what is pending
npm run bootstrap        # adds only what is missing
```

`npm run migrate` never re-runs an applied migration. `npm run bootstrap` only
inserts rows that do not already exist — existing roles, permissions, grants and
every user row are untouched.

For the development database this has already been verified: all 19 migrations
report `up`, and a bootstrap run reports `ADMIN: 12, INSTRUCTOR: 3, STUDENT: 5,
SUPER_ADMIN: 25` with no changes and no warnings.

The one migration that altered existing data,
`20261006072556-change-user-role-to-role-id.js`, converts `Users.role` (a name)
to `Users.roleId` (a foreign key) inside a transaction, and aborts without
committing if any user fails to map. It has already been applied.

## 3. Rollback risk

`npm run migrate` and `npm run bootstrap` are safe. `sequelize-cli
db:migrate:undo` is not, and should not be run against any database that holds
real data.

| Migration | `down` behaviour | Risk |
|---|---|---|
| `20261005112636-create-roles.js` | `DROP TABLE "Roles"` | **Blocked by the database.** `Users.roleId` and `Role_Permissions` reference `Roles`, so PostgreSQL refuses the drop and the undo fails loudly. No data is lost, but roles become unmanageable until the state is repaired. |
| `20261005113635-create-users.js` and the other seven `create-*` table migrations | `DROP TABLE` | **Data loss.** Drops the table and every row in it — users, students, instructors, courses, semesters, enrollments, sessions. |
| `20261006072556-change-user-role-to-role-id.js` | Re-adds `Users.role`, converts `roleId` back to a name, **drops `roleId`** | **Breaks the running application.** The `User` model and every authentication path read `roleId`; after an undo, login and authorization fail until the migration is re-applied. The role names themselves survive. |
| `20261008071022-create-enrollment-procedure.js` | `DROP PROCEDURE public.create_enrollment` | **Breaks enrollment creation.** Both `POST /api/enrollments` and `POST /api/enrollments/me` call the procedure, so every enrollment attempt fails. Existing enrollment rows are untouched. |
| `20261012130000-allow-reenrollment-after-drop.js` | Replaces the procedure with the previous definition, which rejects any existing row | **Reintroduces a fixed limitation.** Re-enrolling after a drop returns `409` again. Rows already reactivated keep `status = 'ACTIVE'` — status is data, not schema — so no enrollment is lost. |
| `20261012120000-grant-admin-course-catalog-view.js` | Deletes the `ADMIN` → `COURSE_CATALOG_VIEW` grant | **Reintroduces a fixed defect.** An admin can write courses but gets `403` reading them back. Recoverable: `npm run bootstrap` re-grants it. |
| `20261012150000-add-lookup-indexes.js` | Drops the ten lookup indexes | **No data loss; slower queries.** The unique index on `User_Sessions.refreshTokenHash` is the one that matters: without it every refresh and logout scans the session table. Recoverable by re-applying the migration. |
| `20261012160000-add-tab-context-to-user-sessions.js` | Drops `User_Sessions.tabContext` and its unique index | **Signs every tab out.** The column is `NOT NULL`; without it every session-row read that filters on the context fails, so refresh and logout stop working until the migration is re-applied. No account, course or enrollment data is touched. |

Ordering note: undoing a migration that earlier migrations depend on cascades.
Undoing the `Roles` creation, for example, would also require undoing the
`Users` migration that references it, which is the data-loss case.

### Recommended practice

- Treat migrations as **forward-only**. To reverse a change, add a new migration
  that makes the correction.
- Take a dump (`pg_dump`) before any `db:migrate:undo`, and only ever undo on a
  copy.
- Before deploying: `npm run migrate:status` then `npm run setup`.
- Recovery from a bad state is always `npm run migrate && npm run bootstrap` —
  both are idempotent, so re-running them converges rather than compounding.

## 4. Test databases

The integration tests never touch a database whose name does not contain `test`.
The harness refuses to create or drop anything else, whatever the configuration
says, and refuses to run at all when `NODE_ENV=production`.

| Variable | Behaviour |
|---|---|
| `TEST_DATABASE_URL` | Used verbatim. This is the explicit target. |
| `DATABASE_URL` (fallback) | The harness derives `<databaseName>_test_<pid>` from it, so `npm test` needs no extra configuration and parallel runs do not collide. |

A database is disposable only because its name says so. Pointing
`TEST_DATABASE_URL` at a shared or production database is refused before any
destructive statement runs.
