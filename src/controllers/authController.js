import {
  loginUser,
  refreshUserToken,
  logoutUser,
  changeUserPassword,
} from "../services/authService.js";
import { registerStudent } from "../services/registerStudentService.js";

import {
  clearLoginAttempts,
  recordFailedLogin,
} from "../middleware/rateLimit.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { created } from "../utils/response.js";

const TAB_CONTEXT_HEADER = "x-tab-context";

/*
 * The context names the cookie to read, so it is validated as a UUID before it
 * is used to build a cookie name, and lower-cased so a client that changed the
 * case still matches the session it was given. It is still only an identifier:
 * the cookie is the credential.
 */
const TAB_CONTEXT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cookieNameFor = (tabContext) => `refresh_${tabContext}`;

const readTabContext = (req) => {
  const value = req.get(TAB_CONTEXT_HEADER);

  return typeof value === "string" && TAB_CONTEXT_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
};

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge:
    (Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7) *
    24 *
    60 *
    60 *
    1000,
  path: "/api/auth",
});

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const result = await loginUser({
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    clearLoginAttempts(req);

    for (const revokedContext of result.revokedContexts) {
      res.clearCookie(cookieNameFor(revokedContext), getCookieOptions());
    }

    res.cookie(
      cookieNameFor(result.tabContext),
      result.refreshToken,
      getCookieOptions()
    );

    return res.status(200).json({
      message: "Login successful",
      accessToken: result.accessToken,
      tabContext: result.tabContext,
      user: result.user,
    });
  } catch (error) {
    recordFailedLogin(req);

    if (error.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (error.message === "ACCOUNT_INACTIVE") {
      return res.status(403).json({
        message: "Account is inactive",
      });
    }

    console.error("Login error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const refresh = async (req, res) => {
  const tabContext = readTabContext(req);

  /*
   * Without a usable context there is no cookie to read, and no other cookie is
   * a fallback: that fallback is exactly what would let a new tab ride on an
   * existing tab's credential.
   */
  if (!tabContext) {
    return res.status(401).json({
      message: "Tab context missing or invalid",
    });
  }

  const cookieName = cookieNameFor(tabContext);

  try {
    const refreshToken = req.cookies[cookieName];

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token missing",
      });
    }

    const result = await refreshUserToken({
      refreshToken,
      tabContext,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.cookie(cookieName, result.refreshToken, getCookieOptions());

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: result.accessToken,
      tabContext: result.tabContext,
      user: result.user,
    });
  } catch (error) {
    if (
      error.message === "INVALID_REFRESH_TOKEN" ||
      error.message === "ACCOUNT_INACTIVE"
    ) {
      res.clearCookie(cookieName, getCookieOptions());

      return res.status(401).json({
        message: "Invalid or expired refresh token",
      });
    }

    console.error("Refresh error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

/*
 * Always 200, so a client can always drop its own state. Without a usable
 * context there is no cookie to name and nothing is revoked — guessing at
 * cookie names is not something this endpoint should do.
 */
export const logout = async (req, res) => {
  const tabContext = readTabContext(req);

  if (!tabContext) {
    return res.status(200).json({
      message: "Logout successful",
    });
  }

  const cookieName = cookieNameFor(tabContext);

  try {
    const refreshToken = req.cookies[cookieName];

    if (refreshToken) {
      await logoutUser({ refreshToken, tabContext });
    }

    res.clearCookie(cookieName, getCookieOptions());

    return res.status(200).json({
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const register = asyncHandler(async (req, res) => {
  const user = await registerStudent(req.body);

  return created(res, { user }, "Student registration successful");
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const result = await changeUserPassword({
    userId: req.user.id,
    currentPassword,
    newPassword,
  });

  return res.status(200).json(result);
});
