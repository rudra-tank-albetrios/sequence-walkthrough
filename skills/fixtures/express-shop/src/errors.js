class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class UnauthorizedError extends AppError {
  constructor(message) {
    super(401, 'unauthorized', message);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(422, 'validation_failed', message);
  }
}

class OutOfStockError extends AppError {
  constructor(message) {
    super(409, 'out_of_stock', message);
  }
}

module.exports = { AppError, UnauthorizedError, ValidationError, OutOfStockError };
