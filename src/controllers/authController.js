import {
  loginUser,
  refreshUserToken,
  logoutUser,
} from "../services/authService.js";


const REFRESH_COOKIE_NAME = "refreshToken";

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

    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getCookieOptions()
    );

    return res.status(200).json({
      message: "Login successful",
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
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
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token missing",
      });
    }

    const result = await refreshUserToken({
      refreshToken,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getCookieOptions()
    );

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    if (
      error.message === "INVALID_REFRESH_TOKEN" ||
      error.message === "ACCOUNT_INACTIVE"
    ) {
      res.clearCookie(
        REFRESH_COOKIE_NAME,
        getCookieOptions()
      );

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

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      await logoutUser(refreshToken);
    }

    res.clearCookie(
      REFRESH_COOKIE_NAME,
      getCookieOptions()
    );

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