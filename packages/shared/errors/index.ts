export {
  errorCodeRegistry,
  errorDomains,
  getErrorMessageKey,
  UNEXPECTED_ERROR_CODE,
  type AppErrorCode,
  type ErrorDomain,
} from './codes';
export { AppError, isAppError, toAppError, type AppErrorOptions } from './app-error';
export { err, ok, safeAsync, type Result, type SafeAsyncOptions } from './safe-async';
