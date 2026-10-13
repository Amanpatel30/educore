import { Op } from "sequelize";
import db from "../../models/index.js";
import { verifyAccessToken } from "../utils/token.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const { User, UserSession } = db;

const TAB_CONTEXT_HEADER = "x-tab-context";

export const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Access token required", 401);
  }

  let payload;

  try {
    payload = verifyAccessToken(authHeader.slice(7));
  } catch {
    throw new AppError("Invalid or expired access token", 401);
  }

  /*
   * The user is read on every request on purpose. A signed token carries the
   * identity and role it was issued with, so without this a disabled account or
   * a removed role would keep working until the token expired.
   */
  const user = await User.findByPk(payload.sub, {
    attributes: ["id", "roleId", "status"],
  });

  if (!user) {
    throw new AppError("Invalid or expired access token", 401);
  }

  if (user.status !== "ACTIVE") {
    throw new AppError("Account is inactive", 403);
  }

  /*
   * A tab's token names the session it was minted for, so logging that tab out
   * stops its access token at once instead of leaving it usable until it
   * expires. Tokens issued before `sid` existed carry none and only get the
   * account checks above.
   */
  if (payload.sid !== undefined) {
    const session = await UserSession.findOne({
      where: {
        id: payload.sid,
        userId: user.id,
        revokedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      attributes: ["id", "tabContext"],
    });

    if (!session) {
      throw new AppError("Invalid or expired access token", 401);
    }

    /*
     * Optional, but when a client sends a context it must be the token's own.
     * A request presenting one tab's token as another's is the one thing this
     * must not quietly allow.
     */
    const tabContext = req.get(TAB_CONTEXT_HEADER);

    if (tabContext && tabContext.toLowerCase() !== session.tabContext) {
      throw new AppError("Tab context does not match the access token", 401);
    }
  }

  req.user = {
    id: user.id,
    roleId: user.roleId,
  };

  next();
});
