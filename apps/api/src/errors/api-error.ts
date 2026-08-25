export interface ApiErrorOptions {
  code: string;
  statusCode: number;
  message: string;
  details?: unknown;
}

/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * The error handler renders these directly; anything else becomes a generic 500.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    // Restore prototype chain — required when extending built-ins under ES targets.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message = 'Bad request', details?: unknown): ApiError {
    return new ApiError({ code: 'BAD_REQUEST', statusCode: 400, message, details });
  }
  static unauthorized(message = 'Unauthorized', details?: unknown): ApiError {
    return new ApiError({ code: 'UNAUTHORIZED', statusCode: 401, message, details });
  }
  static forbidden(message = 'Forbidden', details?: unknown): ApiError {
    return new ApiError({ code: 'FORBIDDEN', statusCode: 403, message, details });
  }
  static notFound(message = 'Not found', details?: unknown): ApiError {
    return new ApiError({ code: 'NOT_FOUND', statusCode: 404, message, details });
  }
  static conflict(message = 'Conflict', details?: unknown): ApiError {
    return new ApiError({ code: 'CONFLICT', statusCode: 409, message, details });
  }
  static tooManyRequests(message = 'Too many requests', details?: unknown): ApiError {
    return new ApiError({ code: 'TOO_MANY_REQUESTS', statusCode: 429, message, details });
  }
  static internal(message = 'Internal server error', details?: unknown): ApiError {
    return new ApiError({ code: 'INTERNAL', statusCode: 500, message, details });
  }
  static notImplemented(message = 'Not implemented', details?: unknown): ApiError {
    return new ApiError({ code: 'NOT_IMPLEMENTED', statusCode: 501, message, details });
  }
}
