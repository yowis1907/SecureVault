// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loginDataSchema, safeHref, settingsSchema, emptyLogin } from './model';

describe('safeHref', () => {
  it('allows http and https addresses', () => {
    expect(safeHref('https://example.test/login')).toBe('https://example.test/login');
    expect(safeHref('http://example.test')).toBe('http://example.test/');
  });

  // A stored "website" is attacker-controllable if a vault is ever imported or shared, and
  // clicking a javascript: link would run code inside the unlocked app.
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.test/abc',
    'example.test',
    '',
  ])('refuses %j', (url) => {
    expect(safeHref(url)).toBeNull();
  });
});

describe('record schemas', () => {
  it('rejects decrypted data of the wrong shape', () => {
    expect(() => loginDataSchema.parse({ ...emptyLogin(), schema: 2 })).toThrow();
    expect(() => loginDataSchema.parse({ ...emptyLogin(), favorite: 'yes' })).toThrow();
    expect(() => loginDataSchema.parse({ ...emptyLogin(), categoryId: 'not-a-uuid' })).toThrow();
  });

  it('bounds settings so a tampered blob cannot disable auto-lock', () => {
    const base = { schema: 1, autoLockMinutes: 5, clipboardClearSeconds: 30 };
    expect(() => settingsSchema.parse({ ...base, autoLockMinutes: 0 })).toThrow();
    expect(() => settingsSchema.parse({ ...base, autoLockMinutes: 100000 })).toThrow();
    expect(() => settingsSchema.parse({ ...base, clipboardClearSeconds: 86400 })).toThrow();
    expect(settingsSchema.parse(base)).toEqual(base);
  });
});
