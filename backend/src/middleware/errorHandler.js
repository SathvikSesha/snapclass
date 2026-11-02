import multer from 'multer';
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
}

export function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof multer.MulterError) {
    return res.status(
      err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    ).json({
      success: false,
      message:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Face image must not exceed 5 MB.'
          : 'Invalid file upload.',
    });
}

  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(err);
  }

  const responsePayload = {
    success: false,
    message:
      err.message ||
      (statusCode >= 500 ? 'Internal server error' : 'Something went wrong.'),
  };
  if (err.code && typeof err.code === 'string') {
    responsePayload.code = err.code;
  }
  res.status(statusCode).json(responsePayload);
}
