package com.securevault.vault;

import com.securevault.activity.ActivityService;
import com.securevault.activity.ActivityType;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.vault.VaultDtos.NewRecord;
import com.securevault.vault.VaultDtos.RecordPage;
import com.securevault.vault.VaultDtos.RecordUpdate;
import com.securevault.vault.VaultDtos.VaultRecord;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stores encrypted records as opaque bytes. Another user's record is reported as not found, never
 * as forbidden, so the API does not confirm that it exists.
 */
@Service
class RecordService {

  static final int QUOTA = 5000;

  private final RecordRepository records;
  private final VaultRepository vaults;
  private final ActivityService activity;
  private final Clock clock;

  RecordService(
      RecordRepository records, VaultRepository vaults, ActivityService activity, Clock clock) {
    this.records = records;
    this.vaults = vaults;
    this.activity = activity;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  RecordPage page(UUID userId, UUID after, int limit) {
    // One extra row tells whether another page exists without a second query.
    List<VaultRecord> rows = records.page(userId, after, limit + 1);
    if (rows.size() <= limit) {
      return new RecordPage(rows, null);
    }
    List<VaultRecord> page = rows.subList(0, limit);
    return new RecordPage(page, page.getLast().id().toString());
  }

  @Transactional(readOnly = true)
  VaultRecord get(UUID userId, UUID id) {
    return records.find(userId, id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
  }

  @Transactional
  VaultRecord create(UUID userId, NewRecord record) {
    lockAndCheckQuota(userId, 1);
    VaultRecord created = insert(userId, record, clock.instant());
    activity.record(userId, ActivityType.RECORD_CREATED, created.id());
    return created;
  }

  /** All or nothing: any failure rolls back every record in the batch. */
  @Transactional
  List<VaultRecord> createBatch(UUID userId, List<NewRecord> batch) {
    lockAndCheckQuota(userId, batch.size());
    Instant now = clock.instant();
    List<VaultRecord> created = new ArrayList<>(batch.size());
    for (NewRecord record : batch) {
      created.add(insert(userId, record, now));
    }
    activity.record(userId, ActivityType.RECORDS_IMPORTED);
    return created;
  }

  @Transactional
  VaultRecord update(UUID userId, UUID id, RecordUpdate update) {
    VaultRecord updated =
        records
            .update(userId, id, update, clock.instant())
            .orElseThrow(() ->
                records.find(userId, id).isPresent()
                    ? new ApiException(ErrorCode.VERSION_CONFLICT)
                    : new ApiException(ErrorCode.NOT_FOUND));
    activity.record(userId, ActivityType.RECORD_UPDATED, id);
    return updated;
  }

  @Transactional
  void delete(UUID userId, UUID id) {
    if (!records.delete(userId, id)) {
      throw new ApiException(ErrorCode.NOT_FOUND);
    }
    activity.record(userId, ActivityType.RECORD_DELETED, id);
  }

  private void lockAndCheckQuota(UUID userId, int adding) {
    if (!vaults.lock(userId)) {
      throw new ApiException(ErrorCode.NOT_FOUND);
    }
    if (records.count(userId) + adding > QUOTA) {
      throw new ApiException(ErrorCode.QUOTA_EXCEEDED);
    }
  }

  private VaultRecord insert(UUID userId, NewRecord record, Instant now) {
    try {
      return records.insert(userId, record, now);
    } catch (DuplicateKeyException e) {
      throw new ApiException(ErrorCode.RECORD_ID_CONFLICT);
    }
  }
}
