import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Spinner } from '../../components/ui/Notice';
import { activity } from '../../lib/api/endpoints';
import { estimateStrength } from '../../lib/strength';
import { analyze, type HealthReport } from '../../lib/vault-health';
import { useUnlockedVault } from '../../vault-session/hooks';
import type { LoginEntry } from '../../vault-session/model';

const EVENT_TEXT: Record<string, string> = {
  LOGIN_SUCCEEDED: 'Signed in',
  ACCOUNT_PASSWORD_CHANGED: 'Account password changed',
  ACCOUNT_PASSWORD_RESET: 'Account password reset by email',
  MASTER_PASSWORD_CHANGED: 'Master password changed',
  VAULT_RESET: 'Vault reset',
  SESSION_REVOKED: 'Signed out another session',
  RECORD_CREATED: 'Added',
  RECORD_UPDATED: 'Changed',
  RECORD_DELETED: 'Deleted',
  RECORDS_IMPORTED: 'Imported items',
};

function IssueList({
  title,
  explanation,
  entries,
}: {
  title: string;
  explanation: string;
  entries: LoginEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="border-t border-line pt-5">
      <h2 className="font-semibold">
        {title} <span className="font-mono text-muted tabular-nums">{entries.length}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">{explanation}</p>
      <ul className="mt-3 flex flex-col gap-1">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link to={`/app/vault/${entry.id}/edit`} className="text-accent hover:underline">
              {entry.title || 'Untitled'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SecurityPage() {
  const vault = useUnlockedVault();
  const [report, setReport] = useState<HealthReport | null>(null);
  const events = useQuery({ queryKey: ['activity'], queryFn: () => activity.latest(20) });

  useEffect(() => {
    let cancelled = false;
    void analyze(vault.logins, estimateStrength).then((r) => {
      if (!cancelled) setReport(r);
    });
    return () => {
      cancelled = true;
    };
  }, [vault.logins]);

  const titles = new Map(vault.logins.map((l) => [l.id, l.title || 'Untitled']));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="mt-1 text-sm text-muted">
          Checked on this device. No password is sent anywhere for this.
        </p>
      </div>

      {!report ? (
        <Spinner label="Checking your passwords" />
      ) : (
        <>
          <section aria-labelledby="health" className="flex flex-col gap-3">
            <h2 id="health" className="sr-only">
              Vault health
            </h2>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[3.5rem] leading-none tabular-nums">
                {report.score}
              </span>
              <span className="text-muted">% of passwords are strong and used only once</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div
                className={clsx('h-full origin-left', report.score >= 80 ? 'bg-accent' : 'bg-warn')}
                style={{ transform: `scaleX(${String(report.score / 100)})` }}
              />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Logins', report.total],
                ['Weak', report.weak.length],
                ['Reused', report.reused.flat().length],
                ['Favorites', report.favorites],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-mono text-xl tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <IssueList
            title="Weak passwords"
            explanation="These could be guessed. Replace them with generated passwords."
            entries={report.weak}
          />
          {report.reused.length > 0 ? (
            <section className="border-t border-line pt-5">
              <h2 className="font-semibold">
                Reused passwords{' '}
                <span className="font-mono text-muted tabular-nums">
                  {report.reused.flat().length}
                </span>
              </h2>
              <p className="mt-1 text-sm text-muted">
                If one of these sites leaks its passwords, the others in the same group are exposed
                too.
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {report.reused.map((group) => (
                  <li
                    key={group.map((g) => g.id).join()}
                    className="flex flex-wrap gap-x-3 gap-y-1 border-l-2 border-warn pl-3"
                  >
                    {group.map((entry) => (
                      <Link
                        key={entry.id}
                        to={`/app/vault/${entry.id}/edit`}
                        className="text-accent hover:underline"
                      >
                        {entry.title || 'Untitled'}
                      </Link>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <IssueList
            title="Not changed for over a year"
            explanation="Consider updating these."
            entries={report.old}
          />
          <IssueList
            title="No password saved"
            explanation="These logins have an empty password."
            entries={report.empty}
          />
          {report.weak.length + report.reused.length + report.old.length + report.empty.length ===
            0 && report.total > 0 ? (
            <p className="border-t border-line pt-5 text-sm">Nothing needs attention.</p>
          ) : null}
        </>
      )}

      <section aria-labelledby="activity" className="border-t border-line pt-5">
        <h2 id="activity" className="font-semibold">
          Recent activity
        </h2>
        <p className="mt-1 text-sm text-muted">
          From the server's log. Unlocking happens on your device, so it never appears here.
        </p>
        {events.isPending ? (
          <div className="mt-3">
            <Spinner label="Loading activity" />
          </div>
        ) : events.error ? (
          <p className="mt-3 text-sm text-danger">Activity could not be loaded.</p>
        ) : (
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {events.data.events.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>
                  {EVENT_TEXT[event.type] ?? event.type}
                  {event.recordId
                    ? `: ${titles.get(event.recordId) ?? 'an item since deleted'}`
                    : ''}
                </span>
                <time dateTime={event.occurredAt} className="text-muted">
                  {new Date(event.occurredAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
