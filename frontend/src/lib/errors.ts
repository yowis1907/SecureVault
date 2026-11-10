import {
  CryptoFormatError,
  DecryptionError,
  KeyDerivationError,
  PayloadTooLargeError,
  UnlockError,
} from '../crypto/errors';
import { ApiError } from './api/client';

/**
 * Turns any failure into a sentence that says what happened and what to do. Never includes input
 * values, server details, or anything secret.
 */
export function messageFor(error: unknown): string {
  if (error instanceof UnlockError) return 'That master password is incorrect.';
  if (error instanceof KeyDerivationError) {
    return 'Your device ran out of memory while deriving the key. Close other tabs and try again.';
  }
  if (error instanceof PayloadTooLargeError)
    return 'This item is too large to save. Shorten the notes and try again.';
  if (error instanceof DecryptionError)
    return 'This item could not be decrypted. It may be damaged.';
  if (error instanceof CryptoFormatError) {
    return 'The vault data from the server is not in a format this app accepts.';
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'The email or account password is incorrect.';
      case 'EMAIL_NOT_VERIFIED':
        return 'Confirm your email address first. Check your inbox for the link.';
      case 'STEP_UP_FAILED':
        return 'Your account password is incorrect.';
      case 'INVALID_TOKEN':
        return 'This link is invalid or has expired. Request a new one.';
      case 'RATE_LIMITED':
        return error.retryAfterSeconds
          ? `Too many attempts. Try again in ${String(Math.ceil(error.retryAfterSeconds / 60))} minute(s).`
          : 'Too many attempts. Wait a moment and try again.';
      case 'VERSION_CONFLICT':
        return 'This was changed in another tab or device. Lock and unlock to load the latest version.';
      case 'QUOTA_EXCEEDED':
        return 'Your vault has reached its limit of 5,000 items.';
      case 'UNAUTHENTICATED':
        return 'Your session has ended. Sign in again.';
      case 'CSRF_REJECTED':
        return 'The request was blocked as a possible forgery. Reload the page and try again.';
      case 'VALIDATION_FAILED':
        return 'Some of the information is not valid. Check the fields and try again.';
      case 'PAYLOAD_TOO_LARGE':
        return 'This is too large to save.';
      default:
        return 'Something went wrong on the server. Try again in a moment.';
    }
  }
  if (error instanceof TypeError)
    return 'SecureVault could not reach the server. Check your connection.';
  return 'Something went wrong. Try again.';
}
