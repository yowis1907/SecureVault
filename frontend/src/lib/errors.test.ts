// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CryptoFormatError,
  DecryptionError,
  KeyDerivationError,
  PayloadTooLargeError,
  UnlockError,
} from '../crypto/errors';
import { ApiError } from './api/client';
import { messageFor } from './errors';

describe('messageFor', () => {
  it('gives every documented failure its own explanation', () => {
    const codes = [
      'INVALID_CREDENTIALS',
      'EMAIL_NOT_VERIFIED',
      'STEP_UP_FAILED',
      'INVALID_TOKEN',
      'RATE_LIMITED',
      'VERSION_CONFLICT',
      'QUOTA_EXCEEDED',
      'UNAUTHENTICATED',
      'CSRF_REJECTED',
      'VALIDATION_FAILED',
      'PAYLOAD_TOO_LARGE',
    ];
    const messages = codes.map((code) => messageFor(new ApiError(400, code)));
    expect(new Set(messages).size).toBe(codes.length);
    const cryptoMessages = [
      new UnlockError(),
      new KeyDerivationError(),
      new PayloadTooLargeError('x'),
      new DecryptionError(),
      new CryptoFormatError('x'),
    ].map(messageFor);
    expect(new Set(cryptoMessages).size).toBe(5);
  });

  it('turns Retry-After into minutes', () => {
    expect(messageFor(new ApiError(429, 'RATE_LIMITED', 125))).toContain('3 minute');
  });

  it('never echoes unknown codes or raw error text', () => {
    expect(messageFor(new ApiError(500, 'SELECT * FROM users'))).not.toContain('SELECT');
    expect(messageFor(new Error('secret detail'))).not.toContain('secret');
    expect(messageFor(new TypeError('Failed to fetch'))).toContain('could not reach');
  });
});
