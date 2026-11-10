/**
 * What lives inside the encrypted records (ARCHITECTURE section 5.5). Decrypted JSON is checked
 * against these schemas before use, so a damaged or unexpected record cannot crash the app or
 * smuggle in a different shape.
 */
import { z } from 'zod';

export const loginDataSchema = z.object({
  schema: z.literal(1),
  title: z.string().max(200),
  username: z.string().max(500),
  email: z.string().max(500),
  password: z.string().max(10_000),
  urls: z.array(z.string().max(2_000)).max(20),
  notes: z.string().max(20_000),
  categoryId: z.uuid().nullable(),
  tags: z.array(z.string().min(1).max(50)).max(30),
  favorite: z.boolean(),
  passwordUpdatedAt: z.iso.datetime(),
});

export const categoryDataSchema = z.object({
  schema: z.literal(1),
  name: z.string().min(1).max(100),
});

export const settingsSchema = z.object({
  schema: z.literal(1),
  autoLockMinutes: z.number().int().min(1).max(60),
  clipboardClearSeconds: z.number().int().min(10).max(300),
});

export type LoginData = z.infer<typeof loginDataSchema>;
export type CategoryData = z.infer<typeof categoryDataSchema>;
export type VaultSettings = z.infer<typeof settingsSchema>;

interface RecordMeta {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type LoginEntry = LoginData & RecordMeta;
export type Category = CategoryData & RecordMeta;

export const DEFAULT_SETTINGS: VaultSettings = {
  schema: 1,
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
};

export function emptyLogin(): LoginData {
  return {
    schema: 1,
    title: '',
    username: '',
    email: '',
    password: '',
    urls: [],
    notes: '',
    categoryId: null,
    tags: [],
    favorite: false,
    passwordUpdatedAt: new Date().toISOString(),
  };
}

/** Only http and https URLs are ever rendered as links; anything else stays plain text. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}
