import { AppError } from "../utils/AppError.js";

/*
 * Login throttling, fixed window, in memory.
 *
 * Only failed attempts count, so a user signing in normally is never blocked.
 * Both the source address and the targeted account are tracked: the address
 * limit stops one host from guessing, the account limit stops a distributed
 * guess against a single account.
 *
 * shortcut: counters live in this process, so the limits are per instance. A
 * multi-instance deployment needs a shared store.
 */
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 60_000;
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10;
const REGISTER_WINDOW_MS =
  Number(process.env.REGISTER_RATE_LIMIT_WINDOW_MS) || 60_000;
const MAX_REGISTER_ATTEMPTS = Number(process.env.REGISTER_RATE_LIMIT_MAX) || 10;
const MAX_TRACKED_KEYS = 10_000;

const attempts = new Map();
const registerAttempts = new Map();

const keysFor = (req) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  return [
    `ip:${req.ip || "unknown"}`,
    ...(email ? [`email:${email}`] : []),
  ];
};

const countFor = (store, key, now) => {
  const bucket = store.get(key);

  return bucket && bucket.resetAt > now ? bucket.count : 0;
};

const hit = (store, key, now, windowMs) => {
  const bucket = store.get(key);

  if (bucket && bucket.resetAt > now) {
    bucket.count += 1;
  } else {
    store.set(key, { count: 1, resetAt: now + windowMs });
  }
};

const sweepExpired = (store, now) => {
  if (store.size <= MAX_TRACKED_KEYS) {
    return;
  }

  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
};

export const loginRateLimit = (req, res, next) => {
  const now = Date.now();

  sweepExpired(attempts, now);

  if (keysFor(req).some((key) => countFor(attempts, key, now) >= MAX_ATTEMPTS)) {
    return next(
      new AppError(
        "Too many login attempts. Try again later.",
        429
      )
    );
  }

  next();
};

export const recordFailedLogin = (req) => {
  const now = Date.now();

  for (const key of keysFor(req)) {
    hit(attempts, key, now, WINDOW_MS);
  }
};

export const clearLoginAttempts = (req) => {
  for (const key of keysFor(req)) {
    attempts.delete(key);
  }
};

/*
 * Registration is counted on entry, unlike login. Every attempt here creates
 * rows, and a caller who guesses a taken email gets an answer either way, so
 * there is no "failed attempt" to wait for.
 */
export const registerRateLimit = (req, res, next) => {
  const now = Date.now();

  sweepExpired(registerAttempts, now);

  const keys = keysFor(req);

  if (
    keys.some(
      (key) => countFor(registerAttempts, key, now) >= MAX_REGISTER_ATTEMPTS
    )
  ) {
    return next(
      new AppError(
        "Too many registration attempts. Try again later.",
        429
      )
    );
  }

  for (const key of keys) {
    hit(registerAttempts, key, now, REGISTER_WINDOW_MS);
  }

  next();
};

// Lets tests start from a known state; a real deployment never needs it.
export const resetRateLimits = () => {
  attempts.clear();
  registerAttempts.clear();
};
