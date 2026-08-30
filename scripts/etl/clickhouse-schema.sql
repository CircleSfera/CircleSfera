-- ClickHouse schema for CircleSfera analytics (ADR-0016).
-- Run once after provisioning ClickHouse Cloud / self-hosted instance:
--   clickhouse-client --host ... --secure --query "$(cat scripts/etl/clickhouse-schema.sql)"

CREATE DATABASE IF NOT EXISTS circlesfera_analytics;

CREATE TABLE IF NOT EXISTS circlesfera_analytics.reports (
  id String,
  status String,
  targetType String,
  createdAt DateTime64(3),
  updatedAt DateTime64(3),
  resolvedAt Nullable(DateTime64(3))
) ENGINE = MergeTree()
ORDER BY (createdAt, id);

CREATE TABLE IF NOT EXISTS circlesfera_analytics.appeals (
  id String,
  status String,
  targetType String,
  createdAt DateTime64(3),
  updatedAt DateTime64(3),
  resolvedAt Nullable(DateTime64(3))
) ENGINE = MergeTree()
ORDER BY (createdAt, id);

CREATE TABLE IF NOT EXISTS circlesfera_analytics.support_tickets (
  id String,
  status String,
  createdAt DateTime64(3),
  updatedAt DateTime64(3),
  resolvedAt Nullable(DateTime64(3))
) ENGINE = MergeTree()
ORDER BY (createdAt, id);

CREATE TABLE IF NOT EXISTS circlesfera_analytics.transactions (
  id String,
  type String,
  amount Int32,
  currency String,
  status String,
  senderId Nullable(String),
  receiverId Nullable(String),
  postId Nullable(String),
  storyId Nullable(String),
  promotionId Nullable(String),
  liveStreamId Nullable(String),
  createdAt DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (createdAt, id);

CREATE TABLE IF NOT EXISTS circlesfera_analytics.feature_flags (
  id String,
  key String,
  name String,
  isEnabled UInt8,
  percentage Int32,
  createdAt DateTime64(3),
  updatedAt DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (key, id);
