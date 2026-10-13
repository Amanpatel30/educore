import crypto from "crypto";
import { Op } from "sequelize";
import db from "../../models/index.js";

import {
    comparePassword,
    hashPassword,
} from "../utils/password.js";

import { requireText } from "../utils/validate.js";
import { AppError } from "../utils/AppError.js";

import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
} from "../utils/token.js";

const { User, Role, UserSession } = db;

const REFRESH_TOKEN_DAYS =
    Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7;

/*
 * Every live tab is a live session, so an unbounded number of them means an
 * unbounded number of cookies, each sent on requests to /api/auth. The oldest
 * sessions past the limit are revoked on login; the caller clears their
 * cookies.
 */
const MAX_ACTIVE_SESSIONS_PER_USER =
    Number(process.env.MAX_ACTIVE_SESSIONS_PER_USER) || 20;

const getRefreshExpiry = () => {
    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    return expiresAt;
};

const toSessionUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.roleDetails.name,
    status: user.status,
});

const findUserWithRole = (userId, transaction) =>
    User.findByPk(userId, {
        include: [
            {
                model: Role,
                as: "roleDetails",
                attributes: ["id", "name"],
            },
        ],
        transaction,
    });

/*
 * Expired rows are deleted and anything past the cap is revoked, oldest first.
 * Returns the contexts of the sessions that were revoked so the caller can
 * clear their cookies; the browser cannot tell those sessions are gone.
 */
const pruneSessions = async (userId, transaction) => {
    await UserSession.destroy({
        where: {
            userId,
            expiresAt: { [Op.lt]: new Date() },
        },
        transaction,
    });

    const live = await UserSession.findAll({
        where: {
            userId,
            revokedAt: null,
            expiresAt: { [Op.gt]: new Date() },
        },
        attributes: ["id", "tabContext"],
        order: [["createdAt", "ASC"], ["id", "ASC"]],
        transaction,
    });

    const excess = live.length - MAX_ACTIVE_SESSIONS_PER_USER;

    if (excess <= 0) {
        return [];
    }

    const doomed = live.slice(0, excess);

    await UserSession.update(
        { revokedAt: new Date() },
        { where: { id: doomed.map((session) => session.id) }, transaction }
    );

    return doomed.map((session) => session.tabContext);
};

export const loginUser = async ({
    email,
    password,
    ipAddress,
    userAgent,
}) => {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
        where: {
            email: normalizedEmail,
        },
        include: [
            {
                model: Role,
                as: "roleDetails",
                attributes: ["id", "name"],
            },
        ],
    });

    // Don't reveal whether the email exists.
    if (!user) {
        throw new Error("INVALID_CREDENTIALS");
    }

    if (user.status !== "ACTIVE") {
        throw new Error("ACCOUNT_INACTIVE");
    }

    const passwordValid = await comparePassword(
        password,
        user.passwordHash
    );

    if (!passwordValid) {
        throw new Error("INVALID_CREDENTIALS");
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    /*
     * Generated here, never accepted from the client: it decides which
     * credential a request is answered with, so a caller that could choose one
     * could point at another tab's session.
     */
    const tabContext = crypto.randomUUID();

    const { sessionId, revokedContexts } = await db.sequelize.transaction(
        async (transaction) => {
            const session = await UserSession.create(
                {
                    userId: user.id,
                    refreshTokenHash,
                    tabContext,
                    expiresAt: getRefreshExpiry(),
                    ipAddress,
                    userAgent,
                },
                { transaction }
            );

            return {
                sessionId: session.id,
                revokedContexts: await pruneSessions(user.id, transaction),
            };
        }
    );

    return {
        accessToken: generateAccessToken(user, sessionId),
        refreshToken,
        tabContext,
        revokedContexts,
        user: toSessionUser(user),
    };
};

export const refreshUserToken = async ({
    refreshToken,
    tabContext,
    ipAddress,
    userAgent,
}) => {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const transaction = await db.sequelize.transaction();

    try {
        /*
         * The context is matched against the stored value, so a request cannot
         * be answered with another tab's session even if it presents that
         * session's cookie: every cookie the client can read belongs to some
         * other session, and its context is not the one being asked for.
         */
        const session = await UserSession.findOne({
            where: {
                refreshTokenHash,
                tabContext,
                revokedAt: null,
                expiresAt: {
                    [Op.gt]: new Date(),
                },
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!session) {
            throw new Error("INVALID_REFRESH_TOKEN");
        }

        const user = await findUserWithRole(session.userId, transaction);

        if (!user) {
            throw new Error("INVALID_REFRESH_TOKEN");
        }

        if (user.status !== "ACTIVE") {
            throw new Error("ACCOUNT_INACTIVE");
        }

        const newRefreshToken = generateRefreshToken();

        /*
         * Rotated in place rather than by revoking this row and inserting a new
         * one. The row id is the access token's `sid`, so a new row per refresh
         * would invalidate the caller's in-flight access tokens every time the
         * client refreshed.
         */
        session.refreshTokenHash = hashRefreshToken(newRefreshToken);
        session.expiresAt = getRefreshExpiry();
        session.lastUsedAt = new Date();
        session.ipAddress = ipAddress;
        session.userAgent = userAgent;

        await session.save({ transaction });

        const accessToken = generateAccessToken(user, session.id);

        await transaction.commit();

        return {
            accessToken,
            refreshToken: newRefreshToken,
            tabContext,
            user: toSessionUser(user),
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/*
 * The token and the context must both match. Revoking on the context alone
 * would let anyone who learned a context log that tab out, and the context is
 * not a secret — it travels in a response body.
 */
export const logoutUser = async ({ refreshToken, tabContext }) => {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const session = await UserSession.findOne({
        where: {
            refreshTokenHash,
            tabContext,
            revokedAt: null,
        },
    });

    if (!session) {
        return;
    }

    session.revokedAt = new Date();

    await session.save();
};

export const changeUserPassword = async ({
    userId,
    currentPassword,
    newPassword,
}) => {
    const current = requireText(currentPassword, "currentPassword");
    const next = requireText(newPassword, "newPassword");

    if (next.length < 8) {
        throw new AppError("newPassword must be at least 8 characters", 400);
    }

    if (next.length > 72) {
        throw new AppError("newPassword must be at most 72 characters", 400);
    }

    const user = await User.findByPk(userId);

    if (!user) {
        throw new AppError("User not found", 404);
    }

    if (user.status !== "ACTIVE") {
        throw new AppError("Account is inactive", 403);
    }

    const passwordValid = await comparePassword(current, user.passwordHash);

    if (!passwordValid) {
        throw new AppError("Current password is incorrect", 400);
    }

    if (current === next) {
        throw new AppError(
            "New password must be different from current password",
            400
        );
    }

    user.passwordHash = await hashPassword(next);
    await user.save();

    return { message: "Password updated successfully" };
};
