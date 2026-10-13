import { getCurrentUser } from "../services/userService.js";
import { createUser } from "../services/user/createUserService.js";
import { getUsers } from "../services/user/getUsersService.js";
import { getUserById } from "../services/user/getUserByIdService.js";
import { updateUser } from "../services/user/updateUserService.js";
import { created, ok, okList } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPagination } from "../utils/pagination.js";
import {
  parseIdQuery,
  parseSearchQuery,
  parseStringQuery,
} from "../utils/query.js";

export const getCurrentUserController = asyncHandler(
  async (req, res) => {
    const user = await getCurrentUser(req.user.id);

    return ok(res, { user });
  }
);

export const getUsersController = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);

  const result = await getUsers({
    pagination,
    roleId: parseIdQuery(req.query.roleId, "roleId"),
    status: parseStringQuery(req.query.status, {
      label: "status",
      allowed: ["ACTIVE", "INACTIVE"],
    }),
    search: parseSearchQuery(req.query.search),
  });

  return okList(res, "users", result, pagination);
});

export const getUserByIdController = asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);

  return ok(res, { user });
});

export const createUserController = asyncHandler(async (req, res) => {
  const user = await createUser({
    actorId: req.user.id,
    body: req.body,
  });

  return created(res, { user }, "User created successfully");
});

export const updateUserController = asyncHandler(async (req, res) => {
  const user = await updateUser({
    actorId: req.user.id,
    targetId: req.params.id,
    body: req.body,
  });

  return ok(res, { user }, "User updated successfully");
});
