-- Outbox events that failed for good because the queue refused the id of
-- their job (data exports people asked for and clean-ups of the media of
-- content its authors deleted) are put back to be published, once. The
-- publisher has since given every job an id the queue accepts
-- (`outbox-<event id>`), so this cannot happen again and no scheduled retry
-- is needed (ED-016). Events that failed for any other reason are left as
-- they are. Safe to apply again: an event put back is no longer FAILED.
UPDATE "outbox_events"
SET "status" = 'PENDING', "retryCount" = 0, "lastError" = NULL
WHERE "status" = 'FAILED'
  AND "lastError" LIKE '%Custom Id cannot contain%';
