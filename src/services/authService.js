import { Op } from "sequelize";
import db from "../../models/index.js";

import {
    comparePassword,
} from "../utils/password.js";

import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
} from "../utils/token.js";

const { User, Role, UserSession } = db;

const REFRESH_TOKEN_DAYS =
    Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7;

const getRefreshExpiry = () => {
    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    return expiresAt;
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

    const accessToken = generateAccessToken(user);

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    await UserSession.create({
        userId: user.id,
        refreshTokenHash,
        expiresAt: getRefreshExpiry(),
        ipAddress,
        userAgent,
    });

    return {
        accessToken,
        refreshToken,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.roleDetails.name,
            status: user.status,
        },
    };
};

export const refreshUserToken = async ({
    refreshToken,
    ipAddress,
    userAgent,
}) => {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const transaction = await db.sequelize.transaction();

    try {
        // 1. Find and lock the refresh-token session
        const session = await UserSession.findOne({
            where: {
                refreshTokenHash,
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

        // 2. Find the user separately
        const user = await User.findByPk(session.userId, {
            include: [
                {
                    model: Role,
                    as: "roleDetails",
                    attributes: ["id", "name"],
                },
            ],
            transaction,
        });

        if (!user) {
            throw new Error("INVALID_REFRESH_TOKEN");
        }

        // 3. Check user's status
        if (user.status !== "ACTIVE") {
            throw new Error("ACCOUNT_INACTIVE");
        }

        // 4. Revoke old refresh-token session
        session.revokedAt = new Date();
        session.lastUsedAt = new Date();

        await session.save({
            transaction,
        });

        // 5. Generate new refresh token
        const newRefreshToken = generateRefreshToken();

        const newRefreshTokenHash =
            hashRefreshToken(newRefreshToken);

        // 6. Create new refresh-token session
        await UserSession.create(
            {
                userId: user.id,
                refreshTokenHash: newRefreshTokenHash,
                expiresAt: getRefreshExpiry(),
                ipAddress,
                userAgent,
            },
            {
                transaction,
            }
        );

        // 7. Generate new access token
        const accessToken = generateAccessToken(user);

        await transaction.commit();

        return {
            accessToken,
            refreshToken: newRefreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.roleDetails.name,
                status: user.status,
            },
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

export const logoutUser = async (refreshToken) => {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const session = await UserSession.findOne({
        where: {
            refreshTokenHash,
            revokedAt: null,
        },
    });

    if (!session) {
        return;
    }

    session.revokedAt = new Date();

    await session.save();
};