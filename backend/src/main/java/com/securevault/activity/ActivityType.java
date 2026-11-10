package com.securevault.activity;

/** Event types from the API specification. Vault unlocks are absent: the server cannot see them. */
public enum ActivityType {
  LOGIN_SUCCEEDED,
  ACCOUNT_PASSWORD_CHANGED,
  ACCOUNT_PASSWORD_RESET,
  MASTER_PASSWORD_CHANGED,
  VAULT_RESET,
  SESSION_REVOKED,
  RECORD_CREATED,
  RECORD_UPDATED,
  RECORD_DELETED,
  RECORDS_IMPORTED
}
