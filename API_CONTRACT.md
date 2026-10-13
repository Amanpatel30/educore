# EduCore Backend — API Contract

Base URL: `http://localhost:3000`

This document describes the endpoints as they are actually implemented in this
repository. Every schema below was traced from the controller and service code,
not inferred from route names.

---

## 1. Conventions

### Authentication

Two credentials are used together, plus a session identifier:

| Credential | Transport | Lifetime | Notes |
|---|---|---|---|
| Access token | `Authorization: Bearer <jwt>` | `JWT_ACCESS_EXPIRES_IN`, default `15m` | JWT signed with `JWT_ACCESS_SECRET`. Payload: `{ sub: "<userId>", roleId: "<roleId>", sid: "<sessionId>" }` — all strings. `sid` is issued from here on; a token without it is treated as a legacy token and only gets the user checks. |
| Refresh token | `refresh_<tabContext>` httpOnly cookie | `REFRESH_TOKEN_EXPIRES_IN_DAYS`, default 7 days | Opaque 64-byte hex value. Only its SHA-256 hash is stored. One cookie per tab session. |
| Tab context | `X-Tab-Context` header | Same as the refresh session | Non-secret opaque id the server generates at login. Selects which refresh cookie applies. See §4.1. |

Refresh cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`,
`Max-Age=604800` (7 days), `Secure` only when `NODE_ENV=production`. The name
carries the tab context, so simultaneous sessions on one origin do not share a
cookie. A cookie named `refreshToken` (no context) is not read any more.

Because the cookie path is `/api/auth`, the browser sends it only to
`/api/auth/refresh` and `/api/auth/logout`. It is not sent to any other route.

`authenticate` re-reads the account on every request, and — when the token
carries `sid` — requires that session to be unrevoked and unexpired. Logging out
of one tab therefore stops that tab's access token too, without touching
another tab's session.

Authorization is permission-based, not role-based at the route level. Each route
declares a permission name and the middleware checks it against the caller's
role. The role→permission mapping lives in the `Roles`, `Permissions` and
`Role_Permissions` tables.

### Standard request headers

```
Authorization: Bearer <accessToken>
Content-Type: application/json
X-Tab-Context: <tabContext>          # required on /api/auth/refresh and /logout,
                                     # optional elsewhere, must match if sent
```

### Cross-origin requests

Allowed origins come from `CORS_ORIGINS` (comma-separated), defaulting to
`http://localhost:3001`. Allowed responses echo the exact origin and set
`Access-Control-Allow-Credentials: true`; a wildcard is never used, because the
browser rejects a wildcard on credentialed requests.

The frontend must send cookies:

```js
fetch("http://localhost:3000/api/enrollments/me", {
  credentials: "include",
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### Error response schema

Every error response has the same shape:

```json
{ "message": "Human readable reason" }
```

Unexpected server errors always return the generic message
`"Internal server error"` with status `500`; internal details are logged
server-side and never returned. Validation, authorization and conflict errors
(`4xx`) return their specific message.

### Rejected input

Bad input never reaches the database, so a malformed request cannot surface as a
`500` or leak a driver message.

| Input | Result |
|---|---|
| Non-numeric path parameter (e.g. `/api/courses/abc`) | `400 { "message": "id must be a positive integer" }`, using the parameter's own name |
| Body that is not valid JSON | `400 { "message": "Malformed JSON body" }` |
| POST/PUT with no body at all, or a non-JSON `Content-Type` | `400`, from the field checks — never a `500`. Express 5 leaves `req.body` undefined in both cases. |
| Unmatched path | `404 { "message": "Route not found" }` — the JSON shape, not Express's default HTML |
| Query filter outside its documented set | `400`, naming the parameter and the accepted values |

Path parameters are validated before authentication runs, so a malformed id is
`400` even without a token.

### Login rate limiting

`POST /api/auth/login` throttles by client IP and by the submitted email address.
Only **failed** attempts count; a successful login clears both counters.

| Setting | Default |
|---|---|
| `LOGIN_RATE_LIMIT_MAX` | `10` attempts per window |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `60000` |

Exceeding the limit returns `429 { "message": "Too many login attempts. Try again later." }`.
`shortcut: counters are per process, so the limit applies per instance; move them
to a shared store when the API runs on more than one node.`

### Registration rate limiting

`POST /api/auth/register` throttles by client IP and by the submitted email
address. Every attempt counts, successful ones included: an attempt that creates
an account is the one worth limiting, and a rejected one still tells the caller
something about the address.

| Setting | Default |
|---|---|
| `REGISTER_RATE_LIMIT_MAX` | `10` attempts per window |
| `REGISTER_RATE_LIMIT_WINDOW_MS` | `60000` |

Exceeding the limit returns
`429 { "message": "Too many registration attempts. Try again later." }`. The same
per-process caveat as above applies.

### Sessions per user

Each tab is its own session and its own cookie, so the count is capped by
`MAX_ACTIVE_SESSIONS_PER_USER` (default `20`). Signing in past the cap revokes
the oldest sessions and clears their cookies; expired sessions are deleted at the
same time.

### Pagination

Ten list endpoints accept `?page` and `?limit`:
`GET /api/courses/catalog`, `GET /api/courses/instructors/me/courses`,
`GET /api/semesters`, `GET /api/enrollments`, `GET /api/enrollments/me`,
`GET /api/departments`, `GET /api/instructors`, `GET /api/users`,
`GET /api/students`, `GET /api/audit-logs`.

| Behaviour | Result |
|---|---|
| Neither `page` nor `limit` supplied | All matching rows. **No pagination fields in the response** (backwards compatible). |
| `page` and/or `limit` supplied | Defaults: `page=1`, `limit=50`. `limit` is capped at `100`. |

When paginated, the response body gains `total`, `page`, `limit`, `totalPages`.
`count` is always the number of rows **in this response**:

```json
{
  "count": 2,
  "total": 7,
  "page": 1,
  "limit": 2,
  "totalPages": 4,
  "courses": []
}
```

Sorting is fixed per endpoint and documented below, except on the course
catalog, which accepts `?sort=` and `?order=` (§6).

---

## 2. Role → permission matrix

Seeded values, read from the `Role_Permissions` table.

| Permission | SUPER_ADMIN | ADMIN | INSTRUCTOR | STUDENT |
|---|:--:|:--:|:--:|:--:|
| ADMIN_CREATE | X | | | |
| ADMIN_DISABLE | X | | | |
| ROLE_CREATE_UPDATE | X | | | |
| PERMISSION_ASSIGN | X | | | |
| AUDIT_LOG_VIEW_ALL | X | | | |
| SYSTEM_CONFIG_MANAGE | X | | | |
| USER_VIEW_ALL | X | X | | |
| USER_CREATE_UPDATE_DISABLE | X | X | | |
| STUDENT_MANAGE | X | X | | |
| INSTRUCTOR_MANAGE | X | X | | |
| DEPARTMENT_MANAGE | X | X | | |
| ACADEMIC_DATA_MANAGE_ALL | X | | | |
| COURSE_CREATE_UPDATE | X | X | | |
| COURSE_ASSIGN | X | X | | |
| COURSE_CATALOG_VIEW | X | X | | X |
| ASSIGNED_COURSE_VIEW | X | | X | |
| SEMESTER_OPEN_CLOSE | X | X | | |
| ENROLLMENT_CREATE_UPDATE_DROP | X | X | | |
| ENROLLMENT_VIEW_ALL | X | X | | |
| OWN_ENROLLMENT_CREATE_DROP | X | | | X |
| OWN_ENROLLMENT_VIEW | | | | X |
| STUDENT_ROSTER_VIEW | X | | X | |
| GRADE_CREATE_UPDATE | X | | X | |
| OWN_GRADES_VIEW | X | | | X |
| OWN_PROFILE_VIEW_UPDATE | X | | | X |
| AUDIT_LOG_VIEW_ALLOWED | X | X | | |

`ADMIN` holds `COURSE_CATALOG_VIEW`. It was originally missing, which let an
admin create and update courses but receive `403` when reading them back.
Migration `20261012120000-grant-admin-course-catalog-view.js` repaired the
already-provisioned database, and `src/scripts/bootstrapRbac.js` now owns this
matrix for every environment.

Permissions that gate nothing yet: `ADMIN_CREATE`, `ADMIN_DISABLE`,
`ROLE_CREATE_UPDATE`, `AUDIT_LOG_VIEW_ALL`, `SYSTEM_CONFIG_MANAGE`,
`ACADEMIC_DATA_MANAGE_ALL`, `STUDENT_ROSTER_VIEW`, `GRADE_CREATE_UPDATE`,
`OWN_GRADES_VIEW`, `OWN_PROFILE_VIEW_UPDATE`.

`ADMIN_CREATE` and `ADMIN_DISABLE` are deliberately unused: creating and
disabling accounts is handled by `POST`/`PUT /api/users` under
`USER_CREATE_UPDATE_DISABLE`, with the role tiers in §5 deciding what each
caller may create. Split permissions would allow a grant that creates admins
without the ability to create anyone else, which no screen needs.

`DEPARTMENT_MANAGE` gates §9, `INSTRUCTOR_MANAGE` §10, `STUDENT_MANAGE` §12,
`USER_VIEW_ALL` §5 and §11 reads, `PERMISSION_ASSIGN` the §11 write, and
`AUDIT_LOG_VIEW_ALLOWED` §13.

All unauthorized requests return:

```
400-level note: a missing/invalid token gives 401; a valid token for a role
that lacks the permission gives 403.
```

- `401 { "message": "Access token required" }` — no or malformed `Authorization` header.
- `401 { "message": "Invalid or expired access token" }` — signature or expiry
  failure, or the token names a user that no longer exists.
- `403 { "message": "Account is inactive" }` — the token is valid but the account
  has been disabled. The user row is re-read on every request, so disabling an
  account takes effect immediately rather than at token expiry.
- `403 { "message": "You do not have permission to perform this action" }`

---

## 3. Health

### `GET /health`

No authentication.

**200**

```json
{ "status": "ok", "timestamp": "2026-10-12T06:43:40.064Z" }
```

---

## 4. Authentication — `/api/auth`

### `POST /api/auth/register`

Public self-registration for **students only**. No authentication, no token
required. Rate limited per source address and per email (see §1).

Registration does **not** sign the caller in: no `Set-Cookie`, no
`accessToken`, no refresh token in the response. The client sends the student to
the sign-in screen.

**Request**

```json
{
  "name": "New Student",
  "email": "new.student@example.com",
  "password": "Str0ngPass!"
}
```

| Field | Rules |
|---|---|
| `name` | Required. Trimmed, non-empty, max 255 characters. |
| `email` | Required. Trimmed and lower-cased before lookup and storage, exactly as login does. Must parse as an email. Unique — the `Users` table enforces it. |
| `password` | Required. 8 to 72 characters. The upper bound is bcrypt's input limit: bcrypt silently ignores anything past 72 bytes. |

`departmentId` is not required at registration. Registration creates an account in `Users` only. The `Students` profile is created later upon the student's first course enrollment, with the department derived from the selected course.

**Rejected fields.** These are never accepted, and their presence is a `400`
rather than being silently ignored — a client must not believe it set them:

| Field | Why |
|---|---|
| `role`, `roleId` | The server always assigns `STUDENT`. |
| `status`, `isActive` | Accounts are created `ACTIVE` or not at all. |
| `studentCode` | Generated by the server upon enrollment; letting a client choose one invites collisions and hijacking. |
| `admissionDate` | Set to the enrollment date by the server. |
| `passwordHash`, `permissions` | Never client-supplied. |

**Server-assigned values**

| Value | Source |
|---|---|
| `role` | The existing `Roles` row named `STUDENT`, looked up by name. There is no path by which this endpoint creates an `ADMIN`, `SUPER_ADMIN` or `INSTRUCTOR`. |
| `status` | `ACTIVE` |
| `passwordHash` | `bcrypt`, cost 12, through the shared `hashPassword` |

Only the `Users` row is written: no `Students` row and no `Enrollments` row is created.

**201**

```json
{
  "message": "Student registration successful",
  "user": {
    "id": 42,
    "name": "New Student",
    "email": "new.student@example.com",
    "roleId": 4,
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

The response carries no password hash, no token and no other secret. It is the
same safe shape as `GET /api/users/me`.

**Errors**

| Status | Message | Cause |
|---|---|---|
| 400 | `name is required` / `email is required` / `password is required` | Missing or blank |
| 400 | `email must be a valid email address` | Fails the format check |
| 400 | `password must be at least 8 characters` | Too short |
| 400 | `password must be at most 72 characters` | Too long |
| 400 | `name must be at most 255 characters` | Name too long |
| 400 | `<field> is not accepted by this endpoint` | Any rejected field above |
| 409 | `Email is already registered` | Duplicate now, or a concurrent insert caught by the unique constraint |
| 429 | `Too many registration attempts. Try again later.` | Rate limited |
| 500 | `Internal server error` | Unexpected, including the `STUDENT` role not being provisioned |

### 4.1 Tab-isolated sessions

A browser shares one cookie jar between all tabs, so a single refresh cookie
cannot represent two simultaneous sessions. Each login therefore creates its own
server-side session bound to a **tab context**, and each session owns its own
cookie.

| Step | Behaviour |
|---|---|
| Login | The server generates a UUID v4 context, creates the session with it, sets the cookie `refresh_<tabContext>`, and returns `tabContext` in the body. The client keeps it in `sessionStorage` (per tab, non-secret) and sends it back as the `X-Tab-Context` header. |
| Refresh | The header is **required**. The server reads only the cookie named `refresh_<tabContext>` and accepts the session only if its stored `tabContext` equals the header. Missing header, malformed header, or a cookie that does not match → `401`. |
| Logout | Same rule as refresh. Revokes the one session named by the header plus its cookie. Other tabs' sessions and cookies are untouched. |
| Any other request | The header is optional. If it is present and does not match the access token's session, the request is rejected with `401`. |

Facts that make this safe:

- The context is an identifier, never a credential. Authentication still comes
  from the httpOnly cookie, whose value is a 64-byte secret. Knowing another
  tab's context does not grant access to its session — the cookie is still
  required, and it is unreadable from JavaScript.
- No refresh token is ever placed in `localStorage` or `sessionStorage`.
- A request without a context cannot be authenticated by another tab's
  credential: there is no fallback cookie name, and a context-less refresh is
  `401`.
- Refresh rotates the credential of **one** session row in place. The session id
  (`sid`) is stable across rotations, so an in-flight request holding the
  previous access token keeps working.

**Duplicate tabs.** Duplicating a tab copies `sessionStorage`, so the copy
inherits the same context and passes the same cookie: it starts authenticated as
the same session. The two tabs then share one credential, and the first refresh
rotates it — the second tab's next refresh presents a stale value and receives
`401`. Clients should serialize refresh per tab (one in-flight refresh, queued
callers reuse its result); a duplicate tab that falls behind must sign in again.

**Expiry, reuse and cleanup.**

| Case | Behaviour |
|---|---|
| Access token expired | `401 Invalid or expired access token`; the client refreshes. |
| Refresh session expired | `401`, cookie cleared. |
| Refresh token reused after a rotation | `401`, cookie cleared. The session is not revoked, so the legitimate tab keeps working. Detecting reuse and killing the whole chain is still not implemented (see §14.12). |
| Logout | Session revoked. Its access tokens stop working immediately, because `authenticate` checks `sid`. |
| Login | The user's expired sessions are deleted, and sessions beyond `MAX_ACTIVE_SESSIONS_PER_USER` (default 20) are revoked oldest-first with their cookies cleared. This bounds cookie growth for a user who opens many tabs. |
| Cookie count | One cookie per live session, sent only to `/api/auth/*`. |

`X-Tab-Context` must be listed in the CORS allowed headers; it is.

### `POST /api/auth/login`

No authentication. Establishes one tab session.

**Request**

```json
{ "email": "student@example.com", "password": "Test@123" }
```

`email` is trimmed and lower-cased before lookup.

**200**

```
Set-Cookie: refresh_<tabContext>=<opaque>; Max-Age=604800; Path=/api/auth; HttpOnly; SameSite=Lax
```

```json
{
  "message": "Login successful",
  "accessToken": "<jwt>",
  "tabContext": "3f1c8e0a-5b2d-4f77-9a10-8c6e2d4b7f31",
  "user": {
    "id": 4,
    "name": "Student One",
    "email": "student@example.com",
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

`user.role` is the role **name** string, not an id.

**Errors**

| Status | Message | Cause |
|---|---|---|
| 400 | `Email and password are required` | Either field missing or empty |
| 401 | `Invalid email or password` | Unknown email (deliberately indistinguishable from a wrong password) |
| 403 | `Account is inactive` | `Users.status !== 'ACTIVE'` |
| 500 | `Internal server error` | Unexpected |

### `POST /api/auth/refresh`

Requires the `X-Tab-Context` header and the matching `refresh_<tabContext>`
cookie. No `Authorization` header needed.

Rotates that session's refresh credential in place: the presented value stops
working and a new one arrives in the same cookie name. Reusing a rotated value
returns `401` and clears the cookie. The lookup locks the session row
(`SELECT … FOR UPDATE`) so two concurrent refreshes of the *same* session
cannot both succeed. Another tab's session is a different row and is never
touched.

**200**

```json
{
  "message": "Token refreshed successfully",
  "accessToken": "<jwt>",
  "tabContext": "3f1c8e0a-5b2d-4f77-9a10-8c6e2d4b7f31",
  "user": { "id": 4, "name": "Student One", "email": "…", "role": "STUDENT", "status": "ACTIVE" }
}
```

**Errors**

| Status | Message | Cause |
|---|---|---|
| 401 | `Tab context missing or invalid` | No `X-Tab-Context` header, or it is not a UUID |
| 401 | `Refresh token missing` | No cookie with that context's name |
| 401 | `Invalid or expired refresh token` | Unknown, revoked or expired hash, context mismatch, or inactive account. Cookie is cleared. |

### `POST /api/auth/logout`

Requires the `X-Tab-Context` header and its cookie. Always returns `200`, even
when the cookie is absent or already revoked, so a client can always clear its
own state. Revokes only the session named by the header; other tabs stay signed
in.

**200** — `{ "message": "Logout successful" }`

---

## 5. Users — `/api/users`

### `GET /api/users/me`

Authentication: any authenticated role. No permission required.

**200**

```json
{
  "user": {
    "id": 4,
    "name": "Student One",
    "email": "student@example.com",
    "roleId": 4,
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

**Errors:** `401` (no/invalid token), `404 User not found` (token references a
deleted user).

### `GET /api/users`

Permission: `USER_VIEW_ALL`. Sorted by `name` ascending. Supports pagination,
`?roleId=`, `?status=ACTIVE|INACTIVE` and `?search=` (name or email,
case-insensitive substring).

**200**

```json
{
  "count": 5,
  "users": [
    {
      "id": 2,
      "name": "Admin User",
      "email": "admin@test.local",
      "roleId": 2,
      "role": "ADMIN",
      "status": "ACTIVE"
    }
  ]
}
```

`passwordHash` is never serialised.

**Errors:** `401`, `403` (missing `USER_VIEW_ALL`), `400` (malformed `roleId`,
`status`, `page`, `limit`).

### `GET /api/users/:id`

Permission: `USER_VIEW_ALL`. Same shape as `GET /api/users/me`, one user.

**Errors:** `400` (non-numeric id), `401`, `403`, `404 User not found`.

### `POST /api/users`

Permission: `USER_CREATE_UPDATE_DISABLE`. Creates the account **and** its
profile in one transaction, so either both rows exist or neither does.

Request:

```json
{
  "name": "New Student",
  "email": "new.student@test.local",
  "password": "Str0ngPass!",
  "role": "STUDENT",
  "student": {
    "departmentId": 1,
    "studentCode": "STU900",
    "admissionDate": "2026-10-12"
  }
}
```

`instructor` replaces `student` for the `INSTRUCTOR` role, with
`employeeCode` and `designation` instead of `studentCode`/`admissionDate`.
`departmentId` is the numeric id from `GET /api/departments`, not the code.
The profile object is required for `STUDENT` and `INSTRUCTOR` and must be
absent for `ADMIN`.

**201**

```json
{
  "message": "User created successfully",
  "user": {
    "id": 9,
    "name": "New Student",
    "email": "new.student@test.local",
    "roleId": 4,
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

Role tiers:

| Caller | May create |
|---|---|
| `SUPER_ADMIN` | `ADMIN`, `INSTRUCTOR`, `STUDENT` |
| `ADMIN` | `INSTRUCTOR`, `STUDENT` |

`SUPER_ADMIN` cannot be created through the API by anyone.

**Errors:** `400` (`name`/`email`/`password` missing, password under 8
characters, unknown role, missing or incomplete profile, `departmentId` is not
a number), `401`, `403` (`You cannot create or assign the role X`), `404
Department not found`, `409` (`Email is already registered`, `studentCode is
already in use`, `employeeCode is already in use`).

### `PUT /api/users/:id`

Permission: `USER_CREATE_UPDATE_DISABLE`. Accepts any subset of `name`,
`email`, `role`, `status`.

**200**

```json
{
  "message": "User updated successfully",
  "user": {
    "id": 3,
    "name": "Student Two Renamed",
    "email": "student2@test.local",
    "roleId": 4,
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

Rules the endpoint enforces, in this order:

| Attempt | Result |
|---|---|
| Change your own `role` or `status` | `403 You cannot change your own role` / `You cannot change your own status` |
| `ADMIN` managing an `ADMIN` or `SUPER_ADMIN` | `403 You cannot manage ADMIN accounts` |
| `ADMIN` or `SUPER_ADMIN` assigning `SUPER_ADMIN` | `403 You cannot create or assign the role SUPER_ADMIN` |
| Change the `role` of a user who has a student or instructor profile | `409 This user has a student or instructor profile. Remove the profile before changing their role.` |
| Demote or disable the last `ACTIVE` `SUPER_ADMIN` | `409 The last active SUPER_ADMIN cannot be demoted or disabled` |
| Body with none of the four fields | `400 No supported fields to update` |
| `status` that is not `ACTIVE`/`INACTIVE` | `400 status must be one of: ACTIVE, INACTIVE` |

A `name` or `email` change alone never touches the role. An account set to
`INACTIVE` cannot log in and cannot refresh: its existing access token is
rejected with `403 Account is inactive` on the next request.

**Errors:** `400`, `401`, `403`, `404 User not found`, `409`.

---

## 6. Courses — `/api/courses`

### `GET /api/courses/public`

No authentication required. Read-only course catalog for anonymous visitors and public browsing. Returns only published/active courses (`isActive: true`), each with its department (`id`, `name`, `code`), sorted by `code` ascending. Supports pagination (`page`, `limit`), `search`, `departmentId`, `sort`, and `order`. Inactive courses cannot be queried through this endpoint.

### `GET /api/courses/public/:id`

No authentication required. Returns a single active course by id with its associated department. Returns `404 Course not found` if the course does not exist or is inactive.

### `GET /api/courses/catalog`

Permission: `COURSE_CATALOG_VIEW`. Returns only courses with `isActive: true`,
each with its department, sorted by `code` ascending. Supports pagination and
these filters:

| Query | Behaviour |
|---|---|
| `?search=<text>` | Case-insensitive match on `code` or `name`, truncated to 100 characters. |
| `?departmentId=<id>` | Exact department. `400` if not a positive integer. |
| `?sort=<field>` | One of `code` (default), `name`, `credits`, `capacity`, `createdAt`. Anything else is `400`. |
| `?order=asc\|desc` | Default `asc`. Anything else is `400`. |
| `?isActive=true\|false\|all` | Default `true`. See the permission note below. |

`isActive` other than `true` requires `COURSE_CREATE_UPDATE`: the catalog is the
student-facing list of what can be enrolled in, so only an admin may ask to see
retired courses (`false`) or everything (`all`). A student asking for either
receives `403`. Explicitly passing `isActive=true` is an ordinary catalog read.

Because a deleted course is soft-deleted (`isActive: false`), `?isActive=all` is
how an admin screen finds a course to restore — `GET /api/courses/:id` still
resolves by id, and `PUT /api/courses/:id` with `isActive: true` restores it.

**200**

```json
{
  "count": 2,
  "courses": [
    {
      "id": 1,
      "departmentId": 1,
      "code": "CSE101",
      "name": "Intro to Programming",
      "credits": 3,
      "capacity": 100,
      "isActive": true,
      "createdAt": "2026-10-12T06:30:26.658Z",
      "updatedAt": "2026-10-12T06:30:26.658Z",
      "department": { "id": 1, "name": "Computer Science", "code": "CSE" }
    }
  ]
}
```

### `POST /api/courses`

Permission: `COURSE_CREATE_UPDATE`.

**Request**

```json
{
  "departmentId": 1,
  "code": "CSE500",
  "name": "Compilers",
  "credits": 3,
  "capacity": 30
}
```

`departmentId`, `code`, `name` and `credits` are required. `capacity` is
optional (model default `100`). `isActive` is not accepted and defaults to
`true`.

**201** — `{ "course": { … } }`

**Errors**

| Status | Message |
|---|---|
| 400 | `departmentId, code, name and credits are required` |
| 404 | `Department not found` |
| 409 | `Course code already exists` |

### `GET /api/courses/:id`

Permission: `COURSE_CATALOG_VIEW`. Includes `department`.

**200** — `{ "course": { … } }`
**404** — `Course not found`

Note: unlike the catalog, this does **not** filter on `isActive`, so a
soft-deleted course is still readable by id.

### `PUT /api/courses/:id`

Permission: `COURSE_CREATE_UPDATE`. All bodies are partial; omitted fields are
left unchanged. `null`/`undefined` values are ignored rather than cleared.

**Request** — any subset of `departmentId`, `code`, `name`, `credits`,
`capacity`, `isActive`.

**200** — `{ "course": { … } }`

**Errors:** `404 Course not found`, `404 Department not found`,
`409 Course code already exists`.

### `DELETE /api/courses/:id`

Permission: `COURSE_CREATE_UPDATE`. **Soft delete** — sets `isActive = false`.
The row and any enrollments referencing it are preserved.

**204** — no body.
**404** — `Course not found`

### `GET /api/courses/instructors/me/courses`

Permission: `ASSIGNED_COURSE_VIEW`. Resolves the caller's `Instructors` profile
and returns the active courses assigned to it. Sorted by `code`. Supports
pagination.

**200**

```json
{
  "count": 1,
  "courses": [
    {
      "id": 1,
      "code": "CSE101",
      "name": "Intro to Programming",
      "credits": 3,
      "capacity": 100,
      "isActive": true,
      "instructors": [
        { "id": 1, "employeeCode": "EMP001", "designation": "Assistant Professor",
          "CourseInstructor": { "assignedAt": "2026-10-12T06:35:00.000Z" } }
      ],
      "department": { "id": 1, "name": "Computer Science", "code": "CSE" }
    }
  ]
}
```

**404** — `Instructor profile not found` when the caller has no instructor row.

### `POST /api/courses/:courseId/instructors`

Permission: `COURSE_ASSIGN`.

**Request** — `{ "instructorId": 1 }`

**201**

```json
{
  "message": "Course assigned successfully",
  "assignment": { "id": 1, "courseId": 1, "instructorId": 1, "assignedAt": "…" }
}
```

**Errors**

| Status | Message |
|---|---|
| 400 | `Cannot assign an inactive course` |
| 400 | `Instructor is not active` |
| 404 | `Course not found` |
| 404 | `Instructor not found` |
| 409 | `Course is already assigned to this instructor` |

### `DELETE /api/courses/:courseId/instructors/:instructorId`

Permission: `COURSE_ASSIGN`.

**204** — no body.
**404** — `Course assignment not found`

---

## 7. Semesters — `/api/semesters`

Every route on this router requires `SEMESTER_OPEN_CLOSE`. Status values are
`UPCOMING`, `OPEN`, `CLOSED`. Uniqueness of `(name, academicYear)` is enforced
in application code, not by a database constraint.

### `GET /api/semesters`

Sorted by `startDate` descending. Supports pagination.

**200**

```json
{
  "count": 3,
  "semesters": [
    { "id": 1, "name": "Fall", "academicYear": "2026",
      "startDate": "2026-08-01", "endDate": "2026-12-20", "status": "OPEN",
      "createdAt": "…", "updatedAt": "…" }
  ]
}
```

### `POST /api/semesters`

**Request**

```json
{
  "name": "Winter",
  "academicYear": "2027",
  "startDate": "2027-01-05",
  "endDate": "2027-05-20",
  "status": "UPCOMING"
}
```

`name`, `academicYear`, `startDate`, `endDate` required. `status` optional,
defaults to `UPCOMING`. Dates are `DATEONLY` (`YYYY-MM-DD`). `startDate` must be
strictly before `endDate`.

**201** — `{ "message": "Semester created successfully", "semester": { … } }`

**Errors**

| Status | Message |
|---|---|
| 400 | `name, academicYear, startDate and endDate are required` |
| 400 | `Invalid semester status. Use UPCOMING, OPEN or CLOSED` |
| 400 | `startDate must be a valid date` / `endDate must be a valid date` — an unparseable value is rejected instead of reaching PostgreSQL |
| 400 | `startDate must be before endDate` |
| 409 | `Semester already exists for this academic year` |

### `GET /api/semesters/:id`

**200** — `{ "semester": { … } }` · **404** — `Semester not found`

### `PUT /api/semesters/:id`

Partial update of `name`, `academicYear`, `startDate`, `endDate`. The resulting
date range is re-validated even when only one date is supplied.

**200** — `{ "message": "Semester updated successfully", "semester": { … } }`

| Status | Message |
|---|---|
| 400 | `status is changed through PATCH /api/semesters/:id/open or /close` |
| 400 | `No supported fields to update. Send one of: name, academicYear, startDate, endDate` |
| 400 | `startDate must be a valid date` / `endDate must be a valid date` |
| 400 | `startDate must be before endDate` |
| 404 | `Semester not found` |
| 409 | `Semester already exists for this academic year` |

`status` is rejected rather than ignored: sending it here used to return `200`
and change nothing, which reads as success. Use `PATCH …/open` or `…/close`,
which enforce the state machine below.

### `PATCH /api/semesters/:id/open`

`UPCOMING → OPEN`.

**200** — `{ "message": "Semester opened successfully", "semester": { … } }`

| Status | Message |
|---|---|
| 404 | `Semester not found` |
| 409 | `Semester is already open` |
| 409 | `A closed semester cannot be reopened` |

### `PATCH /api/semesters/:id/close`

`OPEN → CLOSED`.

**200** — `{ "message": "Semester closed successfully", "semester": { … } }`

| Status | Message |
|---|---|
| 404 | `Semester not found` |
| 409 | `Semester is already closed` |
| 409 | `An upcoming semester cannot be closed` |

### `DELETE /api/semesters/:id`

Hard delete. Refused while any enrollment references the semester (regardless of
whether those enrollments are `ACTIVE` or `DROPPED`).

**204** — no body.
**404** — `Semester not found`
**409** — `Cannot delete a semester that has enrollments`

---

## 8. Enrollments — `/api/enrollments`

Enrollment creation always goes through the `create_enrollment` PostgreSQL
stored procedure, which runs inside a transaction and locks the course row
(`SELECT … FOR UPDATE`). The procedure is the single source of truth for:

1. student exists, 2. student is `ACTIVE`, 3. course exists, 4. course
`isActive`, 5. semester exists, 6. semester is `OPEN`, 7. the course row is
locked, 8. no `ACTIVE` row exists for `(studentId, courseId, semesterId)`,
9. `ACTIVE` enrollment count for the course+semester `< capacity`, 10. insert a
new row with `enrollmentDate = CURRENT_DATE` and `status = ACTIVE` — or
reactivate the existing `DROPPED` row.

The procedure's error messages are translated into the HTTP responses below.

> **Re-enrolling after a drop.** Approved 2026-10-12. A student may enroll again
> in the same course and semester after dropping it, as long as the semester is
> still `OPEN`. The unique index on `(studentId, courseId, semesterId)` means this
> reactivates the dropped row rather than inserting a second one, so the response
> carries the **same** `enrollment.id`. Reactivation passes the same capacity
> check as a first enrollment, sets `enrollmentDate` to the current date, and
> clears `droppedAt`. `grade` is left as it was.

> `enrollmentDate` is **not** accepted on create — it is always the database
> date. It can be changed afterwards with `PUT /api/enrollments/:id`.

### 8.1 Student self-service

#### `POST /api/enrollments/me`

Permission: `OWN_ENROLLMENT_CREATE_DROP`. The student identity comes from the
access token; `studentId` in the body is ignored.

**Request** — `{ "courseId": 1, "semesterId": 1 }`

**201**

```json
{
  "message": "Course enrollment successful",
  "enrollment": {
    "id": 12, "studentId": 1, "courseId": 1, "semesterId": 1,
    "enrollmentDate": "2026-10-12", "status": "ACTIVE",
    "grade": null, "droppedAt": null, "createdAt": "…", "updatedAt": "…"
  }
}
```

| Status | Message |
|---|---|
| 400 | `studentId, courseId and semesterId are required` |
| 400 | `Student is not active` |
| 400 | `Course is not active` |
| 400 | `Enrollment is only allowed in an open semester` |
| 404 | `Student profile not found` (caller has no `Students` row) |
| 404 | `Student not found` |
| 404 | `Course not found` |
| 404 | `Semester not found` |
| 409 | `Student is already enrolled in this course for this semester` |
| 409 | `Course capacity is full` |

#### `GET /api/enrollments/me`

Permission: `OWN_ENROLLMENT_VIEW`. Returns only the caller's enrollments, newest
first, with nested `course` (including `department`) and `semester`. Supports
pagination.

**200** — `{ "count": 2, "enrollments": [ … ] }`
**404** — `Student profile not found`

#### `GET /api/enrollments/me/:id`

Permission: `OWN_ENROLLMENT_VIEW`. Filtered by `enrollmentId` **and** the
caller's `studentId`, so another student's enrollment is indistinguishable from a
missing one.

**200** — `{ "enrollment": { … } }`
**404** — `Enrollment not found` · **404** — `Student profile not found`

#### `PATCH /api/enrollments/me/:id/drop`

Permission: `OWN_ENROLLMENT_CREATE_DROP`. Sets `status = 'DROPPED'` and
`droppedAt = now()`. The row is kept.

**200** — `{ "message": "Enrollment dropped successfully", "enrollment": { … } }`

| Status | Message |
|---|---|
| 400 | `Enrollment cannot be dropped after the semester is closed` |
| 404 | `Enrollment not found` · `Student profile not found` |
| 409 | `Enrollment is already dropped` |

### 8.2 Administration

#### `POST /api/enrollments`

Permission: `ENROLLMENT_CREATE_UPDATE_DROP`. Enrolls a specified student using
the same procedure and the same error mapping as `POST /me`.

**Request** — `{ "studentId": 2, "courseId": 1, "semesterId": 1 }`
**201** — `{ "message": "Enrollment created successfully", "enrollment": { … } }`

#### `GET /api/enrollments`

Permission: `ENROLLMENT_VIEW_ALL`. Newest first, with nested `student` (plus its
`user`) and `course` (plus `department`) and `semester`. Supports pagination.

**200**

```json
{
  "count": 3,
  "enrollments": [
    {
      "id": 12, "studentId": 1, "courseId": 1, "semesterId": 1,
      "enrollmentDate": "2026-10-12", "status": "ACTIVE", "grade": null,
      "student": { "id": 1, "studentCode": "STU001", "status": "ACTIVE",
                   "user": { "id": 4, "name": "Student One", "email": "…" } },
      "course": { "id": 1, "code": "CSE101", "name": "Intro to Programming",
                  "credits": 3,
                  "department": { "id": 1, "name": "Computer Science", "code": "CSE" } },
      "semester": { "id": 1, "name": "Fall", "academicYear": "2026",
                    "startDate": "2026-08-01", "endDate": "2026-12-20", "status": "OPEN" }
    }
  ]
}
```

#### `GET /api/enrollments/:id`

Permission: `ENROLLMENT_VIEW_ALL`. Same includes as the list.

**200** — `{ "enrollment": { … } }` · **404** — `Enrollment not found`

#### `PUT /api/enrollments/:id`

Permission: `ENROLLMENT_CREATE_UPDATE_DROP`. Re-points an enrollment at a
different student/course/semester, or changes `enrollmentDate`. Omitted fields
keep their current value. Re-validates that the student exists and is `ACTIVE`,
the course exists and is active, the semester exists and is `OPEN`, and that no
other enrollment already occupies the target
`(studentId, courseId, semesterId)` triple.

**Request** — any subset of `studentId`, `courseId`, `semesterId`,
`enrollmentDate`.

**200** — `{ "message": "Enrollment updated successfully", "enrollment": { … } }`

| Status | Message |
|---|---|
| 400 | `Student is not active` · `Course is not active` · `Enrollment can only belong to an open semester` |
| 404 | `Enrollment not found` · `Student not found` · `Course not found` · `Semester not found` |
| 409 | `A dropped enrollment cannot be updated` |
| 409 | `Another enrollment already exists for this student, course and semester` |

This route does **not** check course capacity.

#### `PATCH /api/enrollments/:id/drop`

Permission: `ENROLLMENT_CREATE_UPDATE_DROP`. Same semantics as the self-service
drop, for any enrollment.

**200** — `{ "message": "Enrollment dropped successfully", "enrollment": { … } }`
**Errors:** `400`, `404`, `409` as above.

---

## 9. Departments — `/api/departments`

Every route requires `DEPARTMENT_MANAGE`, held by `SUPER_ADMIN` and `ADMIN` only.
`SUPER_ADMIN` and `ADMIN` may read the list; `INSTRUCTOR` and `STUDENT` receive
`403`. Whether students and instructors should be able to read the department
list is an open decision — see §14.11.

### `GET /api/departments`

Query parameters: `?page`, `?limit`, `?isActive=true|false`, `?search=<text>`.
`search` is a case-insensitive partial match on `name` or `code`, truncated to
100 characters. Sorted by `name` ascending.

**Response 200**

```json
{
  "count": 1,
  "total": 2,
  "page": 1,
  "limit": 1,
  "totalPages": 2,
  "departments": [
    {
      "id": "1",
      "name": "Computer Science",
      "code": "CSE",
      "description": "Computer Science and Engineering Department",
      "isActive": true,
      "createdAt": "2026-10-07T06:43:51.546Z",
      "updatedAt": "2026-10-07T06:43:51.546Z"
    }
  ]
}
```

Without `?page`/`?limit` the pagination fields are absent and `count` is the
number of rows returned.

**Errors:** `400 { "message": "isActive must be \"true\" or \"false\"" }`

### `GET /api/departments/:id`

**Response 200** `{ "department": { ... } }`

**Errors:** `404 { "message": "Department not found" }`

### `POST /api/departments`

**Request**

```json
{ "name": "Mathematics", "code": "MATH", "description": "optional" }
```

`name` and `code` are trimmed; both are required and neither may be blank.
`description` and `isActive` are optional.

**Response 201**

```json
{ "message": "Department created successfully", "department": { ... } }
```

**Errors:** `400 { "message": "name and code are required" }`;
`409 { "message": "Department name already exists" }`;
`409 { "message": "Department code already exists" }`

### `PUT /api/departments/:id`

Partial update of `name`, `code`, `description`, `isActive`. Only the keys sent
are changed.

**Response 200**

```json
{ "message": "Department updated successfully", "department": { ... } }
```

**Errors:** `400 { "message": "isActive must be a boolean" }` — the body value, not
the query string; `400 { "message": "name and code cannot be empty" }`; `404`;
`409` as above, checked against other departments.

### `DELETE /api/departments/:id`

**Response 204** — no body.

**Errors:** `404 { "message": "Department not found" }`;
`409 { "message": "Cannot delete a department that still has courses, students or instructors. Deactivate it instead." }`

Deletion is refused while any course, student or instructor still references the
department. Deactivating (`PUT` with `isActive: false`) is the supported way to
retire one.

---

## 10. Instructors — `/api/instructors`

All routes require `INSTRUCTOR_MANAGE`, held by `SUPER_ADMIN` and `ADMIN` only.
An instructor account is created through `POST /api/users` (see §5), which
writes the user and the profile in one transaction. There is no
`POST /api/instructors` and no delete: deactivating the profile
(`PUT` with `status: "INACTIVE"`) is the supported way to retire one.

### `GET /api/instructors`

Query parameters: `?page`, `?limit`, `?departmentId=<id>`,
`?status=ACTIVE|INACTIVE`, `?search=<text>`. `search` is a case-insensitive
partial match on `employeeCode`, the account's `name`, or its `email`, truncated
to 100 characters. Sorted by `employeeCode` ascending.

**Response 200**

```json
{
  "count": 1,
  "total": 1,
  "page": 1,
  "limit": 1,
  "totalPages": 1,
  "instructors": [
    {
      "id": "2",
      "userId": "3",
      "departmentId": "1",
      "employeeCode": "EMP001",
      "designation": "Assistant Professor",
      "status": "ACTIVE",
      "createdAt": "2026-10-07T06:51:31.450Z",
      "updatedAt": "2026-10-07T06:51:31.450Z",
      "user": {
        "id": "3",
        "name": "Instructor One",
        "email": "instructor@gmail.com",
        "status": "ACTIVE"
      },
      "department": {
        "id": "1",
        "name": "Computer Science",
        "code": "CSE"
      }
    }
  ]
}
```

**Errors:** `400 { "message": "departmentId must be a positive integer" }`;
`400 { "message": "status must be one of: ACTIVE, INACTIVE" }`

### `GET /api/instructors/:id`

Same object as the list, plus `courses`.

**Response 200**

```json
{
  "instructor": {
    "id": "2",
    "employeeCode": "EMP001",
    "user": { "id": "3", "name": "Instructor One", "email": "instructor@gmail.com", "status": "ACTIVE" },
    "department": { "id": "1", "name": "Computer Science", "code": "CSE" },
    "courses": [
      {
        "id": "1",
        "code": "CSE101",
        "name": "Introduction to Programming",
        "isActive": true,
        "CourseInstructor": { "assignedAt": "2026-10-07T09:48:42.695Z" }
      }
    ]
  }
}
```

**Errors:** `404 { "message": "Instructor not found" }`

### `PUT /api/instructors/:id`

Permission: `INSTRUCTOR_MANAGE`. Accepts any subset of `designation`,
`departmentId`, `status`. Account fields (`name`, `email`, `password`) are
**not** accepted here — use `PUT /api/users/:id`.

Request:

```json
{ "designation": "Associate Professor" }
```

**200**

```json
{
  "message": "Instructor updated successfully",
  "instructor": {
    "id": 1,
    "userId": 5,
    "departmentId": 1,
    "employeeCode": "EMP001",
    "designation": "Associate Professor",
    "status": "ACTIVE"
  }
}
```

**Errors:** `400` (non-numeric id, `status` not `ACTIVE`/`INACTIVE`,
`departmentId` not a number, empty body), `401`, `403`, `404 Instructor not
found` / `Department not found`.

---

## 11. Roles — `/api/roles`

### `GET /api/roles`

Permission: `USER_VIEW_ALL`. Returns every role with its permission names,
sorted.

**200**

```json
{
  "count": 4,
  "roles": [
    {
      "id": 1,
      "name": "SUPER_ADMIN",
      "description": "Full system access",
      "permissions": ["AUDIT_LOG_VIEW_ALLOWED", "COURSE_ASSIGN", "..."]
    }
  ]
}
```

**Errors:** `401`, `403`.

### `PUT /api/roles/:id/permissions`

Permission: `PERMISSION_ASSIGN` (`SUPER_ADMIN` only). **Replaces** the role's
entire grant set with the array provided — there is no partial update, so a
client must send the full desired list, which it can read from `GET /api/roles`.

Request:

```json
{ "permissions": ["COURSE_CATALOG_VIEW", "OWN_ENROLLMENT_VIEW"] }
```

**200**

```json
{
  "message": "Role permissions updated successfully",
  "role": { "id": 4, "name": "STUDENT", "permissions": ["COURSE_CATALOG_VIEW", "OWN_ENROLLMENT_VIEW"] }
}
```

Guards: a caller cannot change the permissions of its own role (`403 You cannot
change the permissions of your own role`) and cannot grant a permission it does
not itself hold (`403 You cannot grant a permission you do not hold: X`). Both
exist to stop privilege escalation and self-lockout. In practice only
`SUPER_ADMIN` reaches this endpoint and it holds every permission, so the second
rule is defence in depth for a future where grants are narrower.

**Errors:** `400` (`Unknown permission: X`, `permissions` not an array of
non-empty strings), `401`, `403`, `404 Role not found`.

---

## 12. Students — `/api/students`

Both routes require `STUDENT_MANAGE` (`SUPER_ADMIN`, `ADMIN`). Student accounts
are created through `POST /api/users` (see §5). `STUDENT_ROSTER_VIEW` is
deliberately not accepted: it exists for an instructor reading the roster of a
course they teach, which is a different endpoint.

### `GET /api/students`

Query parameters: `?page`, `?limit`, `?departmentId=<id>`,
`?status=ACTIVE|INACTIVE`, `?search=<text>` (case-insensitive partial match on
`studentCode`, the account's `name`, or its `email`, truncated to 100
characters). Sorted by `studentCode` ascending.

**200**

```json
{
  "count": 1,
  "students": [
    {
      "id": 1,
      "userId": 4,
      "departmentId": 1,
      "studentCode": "STU001",
      "admissionDate": "2024-08-01",
      "status": "ACTIVE",
      "user": { "id": 4, "name": "Student One", "email": "student@example.com" },
      "department": { "id": 1, "code": "CSE", "name": "Computer Science" }
    }
  ]
}
```

**Errors:** `400` (malformed `status`, `departmentId`, `page`, `limit`), `401`,
`403`.

### `GET /api/students/:id`

Permission: `STUDENT_MANAGE`. Adds the student's enrollments, newest first,
each with its course and semester.

**Errors:** `400` (non-numeric id), `401`, `403`, `404 Student not found`.

---

## 13. Audit logs — `/api/audit-logs`

### `GET /api/audit-logs`

Permission: `AUDIT_LOG_VIEW_ALLOWED` (`SUPER_ADMIN`, `ADMIN`). Read-only: rows
are written inside the transactions that make the change, so no endpoint
creates one. Sorted by `createdAt` descending.

Query parameters: `?page`, `?limit`, `?operation=<NAME>` (exact match).

**200**

```json
{
  "count": 1,
  "auditLogs": [
    {
      "id": 1,
      "adminUserId": 2,
      "operation": "CREATE_USER",
      "targetType": "User",
      "targetId": 9,
      "createdAt": "2026-10-12T10:15:00.000Z",
      "admin": { "id": 2, "name": "Admin User", "email": "admin@test.local" }
    }
  ]
}
```

Operations currently recorded: `CREATE_USER`, `UPDATE_USER`,
`UPDATE_ROLE_PERMISSIONS`, `UPDATE_INSTRUCTOR`. A row records *that* a change
happened and to which record — it does not store before/after field values.

**Errors:** `400` (malformed `page`/`limit`), `401`, `403`.

---

## 14. Known limitations

These are current behaviours the frontend must work with. They are not bugs
being fixed silently.

1. **Reactivating a dropped enrollment does not preserve the original
   enrollment date.** The row is reused, so `enrollmentDate` moves to the day the
   student re-enrolled and the earlier date is not kept anywhere. The
   `(studentId, courseId, semesterId)` unique index is why the row is reused.
   Dropping frees the seat for *other* students, and re-enrolling takes a seat
   again.
2. **Lists are unbounded unless you ask for pages.** With no `?page`/`?limit`,
   the list endpoints return every row.
3. **`GET /api/courses/:id` returns soft-deleted courses** (no `isActive`
   filter). Listing them is a workaround: `GET /api/courses/catalog?isActive=all`
   with `COURSE_CREATE_UPDATE`.
4. **`ADMIN` cannot list an instructor's assigned courses** — that route needs
   `ASSIGNED_COURSE_VIEW`, held by `SUPER_ADMIN` and `INSTRUCTOR` only.
5. **`OWN_ENROLLMENT_VIEW` is held by `STUDENT` only**, so an instructor or
   admin calling `GET /api/enrollments/me` receives `403`, not `404`.
   `SUPER_ADMIN` does hold `OWN_ENROLLMENT_CREATE_DROP` but has no student
   profile, so `POST /api/enrollments/me` returns `404 Student profile not
   found` for it.
6. **No filtering or search on the enrollment lists.** They cannot be filtered by
   course, student or semester. Departments, instructors, students, users and
   audit logs can be searched and filtered.
7. **`?sort=`/`?order=` exist on the course catalog only.** Every other list
   has a fixed sort order, documented above.
8. **Semester uniqueness is application-level**, so concurrent creates can race
   past the `409`.
9. **`createCourse` rejects `credits: 0` and `capacity: 0`** because it tests
   for falsiness rather than `undefined`.
10. **Instructor accounts are only created through `POST /api/users`.** There is
    no `POST /api/instructors`, and nothing anywhere deletes an instructor row:
    retiring one means `PUT /api/instructors/:id` with `status: "INACTIVE"`, which
    leaves the row and the account in place. Departments, by contrast, have full
    create/update/deactivate/delete.
11. **The department list requires `DEPARTMENT_MANAGE`**, so `INSTRUCTOR` and
    `STUDENT` receive `403`. A student-facing "which department am I in" screen
    would need either a new read permission or a different endpoint. Open
    decision.
12. **A replayed refresh token is rejected but does not revoke the session.** A
    refresh rewrites that session's credential in place, so the previous value
    stops working immediately. A replay is refused and the live session keeps
    working; there is no session-family column, so a stolen-then-rotated chain
    is not force-ended. Implementing family revocation is a schema change. Open
    decision.
13. **Dropped counts are counted as taken seats**: capacity counts only `ACTIVE`
    enrollments, but a semester cannot be deleted while any enrollment row
    (dropped included) exists.
14. **`enrollmentId`/`courseId` etc. are `BIGINT`** and are returned as strings
    by `pg` when they exceed `Number.MAX_SAFE_INTEGER`. Treat ids as opaque.
15. **There is no self-service profile or password endpoint.** A signed-in user
    cannot change their own password or email; `PUT /api/users/:id` requires
    `USER_CREATE_UPDATE_DISABLE` and refuses self role/status changes. Password
    resets are an admin SQL operation today.
16. **Nothing stops two semesters from being `OPEN` at once.** `PATCH …/open`
    only checks the semester it is given, and enrollment accepts any `OPEN`
    semester, so both can take enrollments simultaneously. If only one term may
    be open at a time, that rule does not exist yet. Open decision.
17. **Audit rows have no field-level detail.** An `Admin_Operations` row records
    the actor, the operation, the target type and the target id — not the values
    before and after. Reconstructing "what did this admin change?" needs a schema
    addition. Open decision.
18. **A duplicated tab shares its original's session until the first refresh.**
    Duplicating a tab copies `sessionStorage`, so the copy starts already signed
    in on the same session. Whichever tab refreshes first spends the credential;
    the other tab's next refresh is refused with `401` and it must sign in again.
    The frontend should keep at most one refresh in flight per tab and reuse its
    result, so a tab does not race itself.
19. **Self-registration creates students only.** There is no public path to an
    `ADMIN`, `SUPER_ADMIN` or `INSTRUCTOR` account; those come from
    `POST /api/users` (§5). A registered student also cannot change their
    password yet — see item 15.

---

## 15. Missing endpoints (proposed — not implemented)

These are gaps where a seeded permission or an existing table has no API. Each
needs approval before implementation. Nothing in this section exists today.

Departments (§9), instructors (§10), roles (§11), students (§12), users (§5) and
audit logs (§13) are implemented. What remains:

| Proposed endpoint | Permission | Justification |
|---|---|---|
| `PUT /api/users/me`, `POST /api/users/me/password` | `OWN_PROFILE_VIEW_UPDATE` | Self-service profile and password change. No endpoint lets a signed-in user change their own password. |
| `PUT /api/enrollments/:id/grade` | `GRADE_CREATE_UPDATE` | `Enrollments.grade` column and the permission exist; `PUT /api/enrollments/:id` deliberately does not write `grade`. |
| `GET /api/courses/:id/roster` | `STUDENT_ROSTER_VIEW` | Instructor view of enrolled students. `STUDENT_ROSTER_VIEW` is seeded but gates nothing. |
| Filters on enrollment lists (`?courseId`, `?semesterId`, `?studentId`, `?status`) | — | Admin enrollment screens need them. |

Also worth deciding: a course is not tied to a semester anywhere in the schema.
Semesters attach to *enrollments*, so the same course can be enrolled in any open
semester. If the intended model is "course offerings per semester", that is a
schema change and needs a separate discussion.

---

## 16. Running the backend

```bash
npm install
npm run setup            # migrate, then load roles/permissions; safe to re-run
npm start                # http://localhost:3000
npm run dev              # same, with nodemon
npm test                 # integration tests against a throwaway database
```

`npm run setup` is `npm run migrate` followed by `npm run bootstrap`:

- `npm run migrate` creates schema. Safe to re-run; applied migrations are never
  repeated.
- `npm run bootstrap` loads `Roles`, `Permissions` and their grants from
  `src/scripts/bootstrapRbac.js`. Safe to re-run; it inserts only what is missing
  and never deletes.

Neither phase destroys data. See `MIGRATIONS.md` for the upgrade path for an
existing database, and for why `db:migrate:undo` must not be run against a
database that holds real data.

Configuration comes from `.env` (git-ignored). `.env.example` lists every key with
a placeholder value. Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`. The server
validates these before binding the port and exits with a clear message if either
is missing — a missing signing secret cannot reach production as a login-time
`500`. Optional: `PORT` (default `5000`, dev `.env` uses `3000`), `NODE_ENV`,
`JWT_ACCESS_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`, `CORS_ORIGINS`,
`LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS`, `REGISTER_RATE_LIMIT_MAX`,
`REGISTER_RATE_LIMIT_WINDOW_MS`, `MAX_ACTIVE_SESSIONS_PER_USER`, `SQL_LOGGING`,
`TEST_DATABASE_URL`. `npm run seed:test-user` additionally needs
`SEED_USER_PASSWORD`; no password is stored in source.

`npm test` runs only against a database whose name contains `test`: it uses
`TEST_DATABASE_URL` verbatim when set, otherwise derives
`<databaseName>_test_<pid>` from `DATABASE_URL`. It migrates it, runs the same
RBAC bootstrap deployment runs, seeds fixtures, then drops it. It refuses to
create or drop any database not named as a test database, and refuses to run at
all when `NODE_ENV=production`, so it cannot reach a shared or production
database.

---

## 17. Frontend integration checklist

1. Point the app at `http://localhost:3000` (`NEXT_PUBLIC_API_URL` or similar).
2. Send `credentials: "include"` on every request so the refresh cookie travels.
3. Add `http://localhost:3001` to `CORS_ORIGINS` in the backend `.env` if the
   frontend runs on a different port than the default.
4. Keep the access token **in memory only** — it must not be persisted to
   `localStorage`. The refresh cookie is `HttpOnly` and is the durable credential.
5. On any `401` from a non-auth route, call `POST /api/auth/refresh` once and
   retry the original request. Refresh returns a **new** access token; always
   replace the old one.
6. On `401` from `/api/auth/refresh`, treat the session as over and route to
   login. The cookie is cleared server-side.
7. Bootstrap the session on app load with `POST /api/auth/refresh` (it returns
   the user as well as a token) rather than storing the user object.
8. `role` in the login/refresh response and in `GET /api/users/me` is the role
   name string: `SUPER_ADMIN`, `ADMIN`, `INSTRUCTOR`, `STUDENT`.
9. Handle `403 { "message": "Account is inactive" }` separately from a permission
   `403`: it means the session should be ended, not that a permission is missing.
10. Treat ids as **opaque strings**, not numbers (see §14.14).
11. The admin course forms can now be built: `GET /api/departments` supplies
    `departmentId` for `POST /api/courses`, and `GET /api/instructors` supplies
    `instructorId` for `POST /api/courses/:courseId/instructors`.
12. Expect `429` from `/api/auth/login` after repeated failures and surface it as
    "try again shortly" rather than a credential error.
13. **Tab isolation is the frontend's job to wire, not to fake.** On login store
    `tabContext` in `sessionStorage` (it is not a secret) and send it as
    `X-Tab-Context` on every request, at minimum on `/api/auth/refresh` and
    `/api/auth/logout`. Do not put any refresh token in `localStorage` or
    `sessionStorage`, and do not gate the UI on a stored flag — the server is
    what decides whether a tab is signed in.
14. Each tab must run **one** refresh at a time and share its result with queued
    callers. Two concurrent refreshes of the same tab leave one `401` (see
    §4.1), which is otherwise easy to mistake for an expired session.
15. A duplicated tab inherits `sessionStorage`, so it begins signed in on the
    same session as its original and is refused on its first refresh (item 18).
    Handle that `401` as "sign in again", not as "session expired".
16. Offer the sign-up form against `POST /api/auth/register`: `name`, `email`,
    `password`. `departmentId` is not required at registration. It returns no token,
    so route the user to sign-in afterwards. The Student profile is created upon first
    course enrollment with department derived from the enrolled course.
