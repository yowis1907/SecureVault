import { afterEach, describe, expect, it } from 'vitest';
import { resetTrustedTypesForTests, trustedWorkerUrl, WORKER_POLICY_NAME } from './trusted-types';

/** A stand-in for window.trustedTypes that records the policy it is given. */
function fakeFactory() {
  const created: { name: string; rule: (input: string) => string }[] = [];
  return {
    created,
    createPolicy(name: string, rules: { createScriptURL: (input: string) => string }) {
      created.push({ name, rule: rules.createScriptURL });
      return { createScriptURL: (input: string) => ({ trusted: rules.createScriptURL(input) }) };
    },
  };
}

const workerPath = '/assets/argon2.worker-abc123.js';

afterEach(() => {
  resetTrustedTypesForTests();
});

describe('trustedWorkerUrl', () => {
  it('passes the worker URL through one named policy', () => {
    const factory = fakeFactory();
    const result = trustedWorkerUrl(workerPath, factory);
    expect(result).toEqual({ trusted: new URL(workerPath, location.href).href });
    expect(factory.created.map((p) => p.name)).toEqual([WORKER_POLICY_NAME]);

    // A second call reuses the policy; the browser would refuse a duplicate name.
    trustedWorkerUrl(workerPath, factory);
    expect(factory.created).toHaveLength(1);
  });

  it('lets no other script URL through the policy', () => {
    const factory = fakeFactory();
    trustedWorkerUrl(workerPath, factory);
    const rule = factory.created[0]?.rule;
    expect(() => rule?.(new URL('/assets/other.js', location.href).href)).toThrow(TypeError);
    expect(() => rule?.('https://evil.example/x.js')).toThrow(TypeError);
    expect(() => trustedWorkerUrl('/assets/other.js', factory)).toThrow(TypeError);
  });

  it('refuses a worker from another site', () => {
    expect(() => trustedWorkerUrl('https://evil.example/w.js', fakeFactory())).toThrow(TypeError);
    expect(() => trustedWorkerUrl('https://evil.example/w.js', undefined)).toThrow(TypeError);
  });

  it('gives a plain URL where the browser has no Trusted Types', () => {
    const result = trustedWorkerUrl(workerPath, undefined);
    expect(String(result)).toBe(new URL(workerPath, location.href).href);
  });
});
