// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dekWrapAad, recordAad, settingsAad } from './aad';
import { utf8Decode } from './encoding';
import { CryptoFormatError } from './errors';
import { DEFAULT_KDF } from './params';

const vaultId = '0b7e5a52-5f0e-4bd3-9f43-2a5d3c8e1f00';
const recordId = '6f1c2d3e-4b5a-4978-8a6b-5c4d3e2f1a0b';

describe('AAD strings from ARCHITECTURE section 5.4', () => {
  it('builds the DEK wrap AAD with the KDF parameters bound in', () => {
    const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
    const aad = utf8Decode(dekWrapAad(vaultId, { ...DEFAULT_KDF, salt }));
    expect(aad).toBe(
      `securevault|1|dek-wrap|${vaultId}|argon2id|65536|3|1|AAECAwQFBgcICQoLDA0ODw==`,
    );
  });

  it('builds the record AAD', () => {
    expect(utf8Decode(recordAad({ vaultId, recordId, recordType: 'LOGIN' }))).toBe(
      `securevault|1|record|${vaultId}|${recordId}|LOGIN`,
    );
  });

  it('builds the settings AAD', () => {
    expect(utf8Decode(settingsAad(vaultId))).toBe(`securevault|1|settings|${vaultId}`);
  });

  it.each([
    ['uppercase', vaultId.toUpperCase()],
    ['braced', `{${vaultId}}`],
    ['a separator', 'a|b'],
    ['empty', ''],
  ])('rejects a %s vault ID, which would make the AAD ambiguous', (_, id) => {
    expect(() => settingsAad(id)).toThrow(CryptoFormatError);
  });

  it('rejects an unknown record type', () => {
    expect(() =>
      recordAad({ vaultId, recordId, recordType: 'NOTE' as unknown as 'LOGIN' }),
    ).toThrow(CryptoFormatError);
  });
});
