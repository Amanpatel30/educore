import crypto from "crypto";
import jwt from "jsonwebtoken";

/*
 * `sid` names the session the token was minted for. It is what makes logout of
 * one tab take effect on that tab's access token without touching another tab's
 * session. Tokens minted before the claim existed have no `sid`; the middleware
 * treats those as legacy and checks only the account.
 */
export const generateAccessToken = (user, sessionId) => {
  return jwt.sign(
    {
      sub: String(user.id),
      roleId: String(user.roleId),
      ...(sessionId !== undefined && { sid: String(sessionId) }),
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    }
  );
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString("hex");
};

export const hashRefreshToken = (refreshToken) => {
  return crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};