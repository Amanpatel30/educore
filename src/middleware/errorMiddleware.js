export const errorHandler = (error, req, res, next) => {
  // Body parser rejections carry a parser trace in message, not a usable
  // reason, so they get a fixed message.
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Malformed JSON body",
    });
  }

  const statusCode = error.statusCode || error.status || 500;

  // Unexpected failures can carry driver-level detail (table names, constraint
  // definitions). Log it here, but never hand it to the client.
  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Internal server error"
        : error.message,
  });
};

export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    message: "Route not found",
  });
};
