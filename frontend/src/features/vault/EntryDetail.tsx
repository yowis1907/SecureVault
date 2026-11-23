import { Copy, ExternalLink, Eye, EyeOff, Pencil, Star, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { messageFor } from '../../lib/errors';
import { copyPlain, copySecret } from '../../vault-session/clipboard';
import { useUnlockedVault } from '../../vault-session/hooks';
import { loginDataSchema, safeHref, type LoginEntry } from '../../vault-session/model';
import { deleteLogin, saveLogin } from '../../vault-session/session';

function Row({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line/70 py-4 last:border-b-0">
      <dt className="col-span-2 text-[0.8125rem] text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
      {action ? <dd>{action}</dd> : null}
    </div>
  );
}

function CopyButton({ label, onCopy }: { label: string; onCopy: () => Promise<void> }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        onCopy().catch(() => {
          toast(
            'The browser did not allow copying. Select the text and copy it yourself.',
            'error',
          );
        });
      }}
      className="glass-clear flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
    >
      <Copy size={17} aria-hidden="true" />
    </button>
  );
}

export function EntryDetail({ entry }: { entry: LoginEntry }) {
  const vault = useUnlockedVault();
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const category = vault.categories.find((c) => c.id === entry.categoryId);
  const seconds = vault.settings.clipboardClearSeconds;

  async function toggleFavorite() {
    try {
      await saveLogin({ ...stripMeta(entry), favorite: !entry.favorite }, entry);
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <article className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent-fill text-[1.75rem] font-semibold text-on-accent"
          >
            {(entry.title.trim()[0] ?? '?').toUpperCase()}
          </span>
          <h2 className="min-w-0 text-[1.75rem] leading-tight font-semibold break-words">
            {entry.title || 'Untitled'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            aria-pressed={entry.favorite}
            aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
            className="glass-clear flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
          >
            <Star
              size={18}
              aria-hidden="true"
              className={entry.favorite ? 'fill-current text-accent' : ''}
            />
          </button>
          <Link
            to={`/app/vault/${entry.id}/edit`}
            className="glass-clear inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-medium transition-colors hover:bg-[var(--sv-glass-strong)]"
          >
            <Pencil size={16} aria-hidden="true" /> Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <Trash2 size={16} aria-hidden="true" /> Delete
          </button>
        </div>
      </div>
      {error ? (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      ) : null}

      <dl className="well mt-7 px-5">
        {entry.username ? (
          <Row
            label="Username"
            action={
              <CopyButton
                label="Copy username"
                onCopy={() =>
                  copyPlain(entry.username).then(() => {
                    toast('Username copied');
                  })
                }
              />
            }
          >
            <span className="break-all">{entry.username}</span>
          </Row>
        ) : null}
        {entry.email ? (
          <Row
            label="Email"
            action={
              <CopyButton
                label="Copy email"
                onCopy={() =>
                  copyPlain(entry.email).then(() => {
                    toast('Email copied');
                  })
                }
              />
            }
          >
            <span className="break-all">{entry.email}</span>
          </Row>
        ) : null}
        <Row
          label="Password"
          action={
            <span className="flex">
              <button
                type="button"
                aria-pressed={revealed}
                aria-label={revealed ? 'Hide password' : 'Show password'}
                onClick={() => {
                  setRevealed((r) => !r);
                }}
                className="glass-clear flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
              >
                {revealed ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )}
              </button>
              <CopyButton
                label="Copy password"
                onCopy={() =>
                  copySecret(entry.password, seconds).then(() => {
                    toast(
                      `Password copied. Clipboard clears in ${String(seconds)} seconds if this tab stays open.`,
                    );
                  })
                }
              />
            </span>
          }
        >
          <span className="secret text-base">
            {revealed ? entry.password || '(empty)' : '••••••••••••'}
          </span>
        </Row>
        {entry.urls.length > 0 ? (
          <Row label={entry.urls.length === 1 ? 'Website' : 'Websites'}>
            <ul className="flex flex-col gap-1">
              {entry.urls.map((url) => {
                const href = safeHref(url);
                return (
                  <li key={url} className="break-all">
                    {href ? (
                      // noreferrer: the destination does not learn it was opened from here.
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        {url} <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      url
                    )}
                  </li>
                );
              })}
            </ul>
          </Row>
        ) : null}
        <Row label="Category">{category?.name ?? <span className="text-muted">None</span>}</Row>
        {entry.tags.length > 0 ? (
          <Row label="Tags">
            <ul className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-surface/80 px-3 py-0.5 text-sm">
                  {tag}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
        {entry.notes ? (
          <Row label="Notes">
            <p className="whitespace-pre-wrap break-words">{entry.notes}</p>
          </Row>
        ) : null}
      </dl>
      <p className="mt-4 text-sm text-muted">
        Password last changed {new Date(entry.passwordUpdatedAt).toLocaleDateString()}
      </p>

      <Dialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        title="Delete this login?"
        description={`“${entry.title || 'Untitled'}” is removed from your vault. This cannot be undone.`}
      >
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              deleteLogin(entry.id).then(
                () => {
                  setConfirming(false);
                  toast('Login deleted');
                  void navigate('/app/vault');
                },
                (e: unknown) => {
                  setConfirming(false);
                  setError(messageFor(e));
                },
              );
            }}
          >
            Delete login
          </Button>
        </div>
      </Dialog>
    </article>
  );
}

export function stripMeta(entry: LoginEntry) {
  return loginDataSchema.parse(entry);
}
