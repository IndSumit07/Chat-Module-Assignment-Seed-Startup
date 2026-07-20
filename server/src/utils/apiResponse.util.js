/**
 * ApiResponse — wraps every successful API response in a consistent shape.
 * Keeps controller responses uniform across the entire codebase.
 */
class ApiResponse {
  constructor(statusCode, message, data = null) {
    this.statusCode = statusCode;
    this.success = statusCode >= 200 && statusCode < 300;
    this.message = message;
    this.data = data;
  }
}

export default ApiResponse;
