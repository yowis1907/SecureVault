import { Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { messageFor } from '../../lib/errors';
import { useUnlockedVault } from '../../vault-session/hooks';
import { deleteCategory, saveCategory } from '../../vault-session/session';

/** Category names are encrypted like everything else; the server only sees CATEGORY records. */
export function CategoriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vault = useUnlockedVault();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (vault.categories.some((c) => c.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError('A category with that name already exists.');
      return;
    }
    setError(null);
    try {
      await saveCategory({ schema: 1, name: trimmed });
      setName('');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Categories"
      description="Deleting a category keeps its logins; they become uncategorized."
    >
      <form onSubmit={(e) => void add(e)} className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="New category"
            value={name}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <Button type="submit">Add</Button>
      </form>
      {error ? (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      ) : null}
      {vault.categories.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No categories yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {vault.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{c.name}</span>
              <button
                type="button"
                aria-label={`Delete category ${c.name}`}
                onClick={() => {
                  deleteCategory(c.id).catch((e: unknown) => {
                    setError(messageFor(e));
                  });
                }}
                className="rounded-[var(--radius-control)] p-2 text-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
