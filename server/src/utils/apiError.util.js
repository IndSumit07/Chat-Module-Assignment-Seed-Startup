/**
 * ApiError — a structured error class for consistent HTTP error responses.
 * Extend the native Error so it integrates naturally with Express error handling.
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);

    this.statusCode = statusCode;
    this.message = message;
    this.errors = errors;   // Fine-grained field-level errors (validation, etc.)
    this.success = false;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

export default ApiError;
