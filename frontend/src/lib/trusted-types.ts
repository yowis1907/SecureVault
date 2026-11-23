/**
 * Trusted Types, ARCHITECTURE section 8.
 *
 * The CSP sends `require-trusted-types-for 'script'`, so the browser refuses a plain string at
 * every script sink: `innerHTML`, `eval`, script URLs, and the Worker constructor. The app needs
 * exactly one of these, the Argon2 worker URL, and this policy allows that URL and nothing else.
 * There is no default policy, so any other sink use is blocked rather than passed through.
 *
 * Browsers without Trusted Types get the plain URL; the CSP's `worker-src 'self'` still applies.
 */

/** The parts of the Trusted Types API used here. TypeScript's DOM types do not include it yet. */
interface ScriptUrlPolicy {
  createScriptURL(input: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(
    name: string,
    rules: { createScriptURL: (input: string) => string },
  ): ScriptUrlPolicy;
}

export const WORKER_POLICY_NAME = 'securevault-worker';

let policy: ScriptUrlPolicy | undefined;
let allowed: string | undefined;

/**
 * Returns the worker URL in the form the Worker constructor accepts under the CSP.
 * Only one URL may ever pass: a later call with a different URL throws.
 */
export function trustedWorkerUrl(
  url: string,
  factory: TrustedTypesFactory | undefined = (globalThis as { trustedTypes?: TrustedTypesFactory })
    .trustedTypes,
): string | URL {
  const absolute = new URL(url, globalThis.location.href);
  if (absolute.origin !== globalThis.location.origin) {
    throw new TypeError('The worker script must come from this site.');
  }
  if (!factory) {
    return absolute;
  }
  if (allowed === undefined) {
    allowed = absolute.href;
    policy = factory.createPolicy(WORKER_POLICY_NAME, {
      createScriptURL: (input) => {
        if (input !== allowed) {
          throw new TypeError('This script URL is not allowed.');
        }
        return input;
      },
    });
  }
  // The returned object is a TrustedScriptURL, which the Worker constructor accepts.
  return (policy as ScriptUrlPolicy).createScriptURL(absolute.href) as string;
}

/** For tests only: forget the policy so each test starts clean. */
export function resetTrustedTypesForTests() {
  policy = undefined;
  allowed = undefined;
}
