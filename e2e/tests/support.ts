import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';

/** A unique marker that cannot appear anywhere by accident. Test values only. */
export function canary(label: string): string {
  return `zq${label}${randomUUID().replaceAll('-', '')}`;
}

/** The newest verification or reset link sent to an address, read from Mailpit's API. */
export async function latestEmailLink(address: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
    ).json()) as { messages?: { ID: string }[] };
    const newest = search.messages?.[0];
    if (newest) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json()) as {
        Text: string;
      };
      const link = /https?:\/\/\S+#token=[A-Za-z0-9_-]+/.exec(message.Text)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email with a link reached ${address}`);
}

function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Every row of every table, as pg_dump writes it. bytea columns appear as hex. */
export function databaseDump(): string {
  return compose(
    'exec',
    '-T',
    'db',
    'sh',
    '-c',
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --no-owner',
  );
}

export function apiLogs(): string {
  return compose('logs', '--no-color', 'api', 'web');
}

/** All HTTP traffic between the browser and the app: URLs, request bodies, response bodies. */
export function recordTraffic(context: BrowserContext) {
  const entries: { url: string; requestBody: string; responseBody: string }[] = [];
  const pending: Promise<void>[] = [];
  context.on('response', (response) => {
    const request = response.request();
    pending.push(
      (async () => {
        let responseBody = '';
        try {
          responseBody = (await response.body()).toString('utf8');
        } catch {
          // Redirects and aborted requests have no body.
        }
        entries.push({ url: request.url(), requestBody: request.postData() ?? '', responseBody });
      })(),
    );
  });
  return {
    async all() {
      await Promise.all(pending);
      return entries;
    },
  };
}

/**
 * Every Content Security Policy violation in any page of the context, Trusted Types included.
 * The app should cause none: a violation means the browser blocked something the app tried.
 */
export async function recordCspViolations(context: BrowserContext) {
  const violations: string[] = [];
  await context.exposeBinding('__reportCspViolation', (_source, text: string) => {
    violations.push(text);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __reportCspViolation: (text: string) => void })
        .__reportCspViolation;
      // sample names the sink and starts the blocked value, so a report says what was refused.
      report(
        `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}: ${event.sample} at ${event.sourceFile}:${String(event.lineNumber)}`,
      );
    });
  });
  return violations;
}

/** Plain text, plus the hex form PostgreSQL uses for bytea, so both are searched. */
export function forms(value: string): string[] {
  return [value, Buffer.from(value, 'utf8').toString('hex')];
}
