import { zodResolver } from '@hookform/resolvers/zod';
import { Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextAreaField, TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { messageFor } from '../../lib/errors';
import { DEFAULT_OPTIONS, generatePassword } from '../../lib/generator';
import { useUnlockedVault } from '../../vault-session/hooks';
import { emptyLogin, type LoginEntry } from '../../vault-session/model';
import { saveLogin } from '../../vault-session/session';

const schema = z.object({
  title: z.string().trim().min(1, 'Give this login a name.').max(200),
  username: z.string().max(500),
  email: z.string().max(500),
  password: z.string().max(10_000),
  urls: z
    .string()
    .max(40_000)
    .refine((v) => lines(v).length <= 20, 'Add at most 20 websites.'),
  categoryId: z.string(),
  tags: z
    .string()
    .max(2_000)
    .refine((v) => tagsOf(v).length <= 30, 'Use at most 30 tags.')
    .refine((v) => tagsOf(v).every((t) => t.length <= 50), 'Keep each tag under 50 characters.'),
  favorite: z.boolean(),
  notes: z.string().max(20_000, 'Notes can be at most 20,000 characters.'),
});
type Values = z.infer<typeof schema>;

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function tagsOf(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

function toValues(entry: LoginEntry | undefined): Values {
  const base = entry ?? { ...emptyLogin(), id: '', version: 0, createdAt: '', updatedAt: '' };
  return {
    title: base.title,
    username: base.username,
    email: base.email,
    password: base.password,
    urls: base.urls.join('\n'),
    categoryId: base.categoryId ?? '',
    tags: base.tags.join(', '),
    favorite: base.favorite,
    notes: base.notes,
  };
}

export function EntryEditorPage() {
  const { id } = useParams();
  const vault = useUnlockedVault();
  const existing = id ? vault.logins.find((l) => l.id === id) : undefined;
  if (id && !existing) {
    return (
      <Notice tone="danger">
        This login no longer exists. It may have been deleted in another tab.
      </Notice>
    );
  }
  return <Editor key={existing?.id ?? 'new'} existing={existing} />;
}

function Editor({ existing }: { existing: LoginEntry | undefined }) {
  const vault = useUnlockedVault();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(existing),
  });
  const password = useWatch({ control: form.control, name: 'password' });
  const title = useWatch({ control: form.control, name: 'title' });
  const e = form.formState.errors;

  async function submit(values: Values) {
    setError(null);
    const passwordChanged = !existing || existing.password !== values.password;
    try {
      const saved = await saveLogin(
        {
          schema: 1,
          title: values.title.trim(),
          username: values.username.trim(),
          email: values.email.trim(),
          password: values.password,
          urls: lines(values.urls),
          notes: values.notes,
          categoryId: values.categoryId || null,
          tags: tagsOf(values.tags),
          favorite: values.favorite,
          passwordUpdatedAt:
            existing && !passwordChanged ? existing.passwordUpdatedAt : new Date().toISOString(),
        },
        existing,
      );
      toast(existing ? 'Login saved' : 'Login added');
      void navigate(`/app/vault/${saved.id}`);
    } catch (err) {
      setError(messageFor(err));
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {existing ? 'Edit login' : 'Add login'}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Everything on this form is encrypted together before it is saved.
      </p>
      <form noValidate onSubmit={form.handleSubmit(submit)} className="mt-6 flex flex-col gap-5">
        <TextField
          label="Name"
          placeholder="For example, Bank"
          autoComplete="off"
          error={e.title?.message}
          {...form.register('title')}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Username"
            autoComplete="off"
            spellCheck={false}
            error={e.username?.message}
            {...form.register('username')}
          />
          <TextField
            label="Email"
            autoComplete="off"
            spellCheck={false}
            error={e.email?.message}
            {...form.register('email')}
          />
        </div>
        <div className="flex flex-col gap-2">
          <PasswordField
            label="Password"
            monospace
            // This field holds a stored secret, not the user's own sign-in, so the browser should
            // not try to fill or save it.
            autoComplete="off"
            error={e.password?.message}
            {...form.register('password')}
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {password ? <StrengthMeter password={password} userInputs={[title]} /> : null}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                form.setValue('password', generatePassword(DEFAULT_OPTIONS), { shouldDirty: true });
              }}
            >
              <Wand2 size={15} aria-hidden="true" /> Generate
            </Button>
          </div>
        </div>
        <TextAreaField
          label="Websites"
          hint="One address per line."
          rows={2}
          spellCheck={false}
          error={e.urls?.message}
          {...form.register('urls')}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3"
              {...form.register('categoryId')}
            >
              <option value="">None</option>
              {vault.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Tags"
            hint="Separate tags with commas."
            autoComplete="off"
            error={e.tags?.message}
            {...form.register('tags')}
          />
        </div>
        <TextAreaField
          label="Notes"
          rows={4}
          error={e.notes?.message}
          {...form.register('notes')}
        />
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--sv-accent)]"
            {...form.register('favorite')}
          />
          Favorite
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex gap-3">
          <Button type="submit" busy={form.formState.isSubmitting}>
            {existing ? 'Save changes' : 'Add login'}
          </Button>
          <Link
            to={existing ? `/app/vault/${existing.id}` : '/app/vault'}
            className="inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line px-4 hover:bg-surface-2"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
