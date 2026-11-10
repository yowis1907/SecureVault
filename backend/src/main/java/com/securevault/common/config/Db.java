package com.securevault.common.config;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;

/** Conversions between java.time and JDBC, kept in one place. */
public final class Db {

  private Db() {}

  public static Timestamp ts(Instant instant) {
    return instant == null ? null : Timestamp.from(instant);
  }

  public static Instant instant(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant();
  }
}
