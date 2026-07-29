import { ErrorCode } from '@circlesfera/shared';
import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    status: HttpStatus,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(
      {
        errorCode,
        message: message || errorCode, // Provide a default message based on code
        details,
      },
      status,
    );
  }

  // Convenient statics for common patterns
  static NotFound(errorCode: ErrorCode, message?: string, details?: unknown) {
    return new AppException(errorCode, HttpStatus.NOT_FOUND, message, details);
  }

  static BadRequest(errorCode: ErrorCode, message?: string, details?: unknown) {
    return new AppException(
      errorCode,
      HttpStatus.BAD_REQUEST,
      message,
      details,
    );
  }

  static Forbidden(errorCode: ErrorCode, message?: string, details?: unknown) {
    return new AppException(errorCode, HttpStatus.FORBIDDEN, message, details);
  }

  static Unauthorized(
    errorCode: ErrorCode,
    message?: string,
    details?: unknown,
  ) {
    return new AppException(
      errorCode,
      HttpStatus.UNAUTHORIZED,
      message,
      details,
    );
  }
}
