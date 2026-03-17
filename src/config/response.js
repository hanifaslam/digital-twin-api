const responseHandler = (
  res,
  success,
  message,
  data = null,
  statusCode = 200,
  metadata = {},
) => {
  return res.status(statusCode).json({
    success,
    message,
    metadata,
    data,
  });
};

const success = (res, message, data = null, statusCode = 200, metadata = {}) => {
  return responseHandler(res, true, message, data, statusCode, metadata);
};

const error = (res, message, statusCode = 500) => {
  return responseHandler(res, false, message, null, statusCode);
};

module.exports = { responseHandler, success, error };
