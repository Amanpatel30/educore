import { AppError } from "../utils/AppError.js";

/*
 * Every path parameter in this API is a numeric id. Without this check a
 * malformed id reaches PostgreSQL, which rejects it as a cast error, and the
 * client sees a 500 instead of a 400.
 *
 * Registered per router rather than as global middleware because Express only
 * populates req.params once a route pattern has matched.
 */
export const numericParams = (router, ...names) => {
  for (const name of names) {
    router.param(name, (req, res, next, value) => {
      if (!/^\d+$/.test(value)) {
        return next(
          new AppError(`${name} must be a positive integer`, 400)
        );
      }

      next();
    });
  }
};
