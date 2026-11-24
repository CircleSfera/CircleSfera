-- Data exports people asked for whose outbox event failed for good because
-- the queue refused the id of its job are put back to be published, once.
-- The publisher has since given every job an id the queue accepts
-- (queueJobId), so this cannot happen again and no scheduled retry is needed
-- (ED-016). Only export-data events can carry this error, and only those
-- whose request still exists (an account erased since took its request with
-- it); nothing else is touched, so no file is deleted by this. Safe to apply
-- again: an event put back is no longer FAILED.
UPDATE "outbox_events" e
SET "status" = 'PENDING', "retryCount" = 0, "lastError" = NULL
WHERE e."status" = 'FAILED'
  AND e."eventName" = 'export-data'
  AND e."lastError" LIKE '%Custom Id cannot contain%'
  AND EXISTS (
    SELECT 1 FROM "data_export_requests" r
    WHERE r."id" = e."payload"->>'requestId'
  );
