-- ClickHouse schema for CircleSfera analytics (see docs/adr/0016-analytical-warehouse-clickhouse.md).
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
  vatCents Int32 DEFAULT 0,
  refundedCents Int32 DEFAULT 0,
  currency String,
  status String,
  senderId Nullable(String),
  receiverId Nullable(String),
  receiverProfileId Nullable(String),
  postId Nullable(String),
  storyId Nullable(String),
  promotionId Nullable(String),
  liveStreamId Nullable(String),
  createdAt DateTime64(3),
  updatedAt DateTime64(3) DEFAULT createdAt
) ENGINE = MergeTree()
ORDER BY (createdAt, id);

-- A table created before these columns gets them here; running the file again
-- changes nothing. A payment is loaded again each time it changes (a refund,
-- a dispute): per id, the row with the latest updatedAt is the one that counts,
-- e.g. argMax(status, updatedAt) ... GROUP BY id.
ALTER TABLE circlesfera_analytics.transactions
  ADD COLUMN IF NOT EXISTS vatCents Int32 DEFAULT 0 AFTER amount,
  ADD COLUMN IF NOT EXISTS refundedCents Int32 DEFAULT 0 AFTER vatCents,
  ADD COLUMN IF NOT EXISTS receiverProfileId Nullable(String) AFTER receiverId,
  ADD COLUMN IF NOT EXISTS updatedAt DateTime64(3) DEFAULT createdAt AFTER createdAt;

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
