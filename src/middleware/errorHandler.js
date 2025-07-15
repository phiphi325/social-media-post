const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  let errorResponse = {
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString()
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    errorResponse.message = 'Validation failed';
    return res.status(400).json(errorResponse);
  }

  if (err.name === 'UnauthorizedError') {
    errorResponse.message = 'Unauthorized access';
    return res.status(401).json(errorResponse);
  }

  // Include error details in development
  if (isDevelopment) {
    errorResponse.error = err.message;
    errorResponse.stack = err.stack;
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json(errorResponse);
};

module.exports = { errorHandler };