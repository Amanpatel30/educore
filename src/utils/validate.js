import { AppError } from "./AppError.js";

export const requireText = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(`${label} is required`, 400);
  }

  return value.trim();
};

/*
 * Body values come in as strings or numbers depending on the client. An id is
 * only accepted when it is a run of digits, so "12abc" cannot reach PostgreSQL.
 */
export const requireId = (value, label) => {
  if (value === undefined || value === null || value === "") {
    throw new AppError(`${label} is required`, 400);
  }

  if (!/^\d+$/.test(String(value))) {
    throw new AppError(`${label} must be a positive integer`, 400);
  }

  return String(value);
};

export const requireOneOf = (value, label, allowed) => {
  if (!allowed.includes(value)) {
    throw new AppError(`${label} must be one of: ${allowed.join(", ")}`, 400);
  }

  return value;
};

/*
 * Without this check an unparseable date reaches PostgreSQL as an invalid
 * timestamp, which surfaces as a 500 instead of telling the client what is
 * wrong. Comparison against an Invalid Date is always false, so a bad value
 * would also slip past "startDate must be before endDate".
 */
export const requireDate = (value, label) => {
  if (value === undefined || value === null || value === "") {
    throw new AppError(`${label} is required`, 400);
  }

  if (Number.isNaN(new Date(value).getTime())) {
    throw new AppError(`${label} must be a valid date`, 400);
  }

  return value;
};

export const toCalendarDay = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const requireTodayOrFutureDate = (value, label) => {
  const dateVal = requireDate(value, label);
  const calendarDay = toCalendarDay(dateVal);
  const todayDay = toCalendarDay(new Date());

  if (calendarDay < todayDay) {
    throw new AppError(`${label} cannot be before today`, 400);
  }

  return dateVal;
};
