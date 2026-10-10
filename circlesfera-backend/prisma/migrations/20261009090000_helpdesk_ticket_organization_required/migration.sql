-- Help Desk: every ticket belongs to an organization. The running version
-- of the code writes it for every new ticket; this fills any ticket opened
-- during an earlier deploy, gives it its first message, and then makes the
-- organization required.

UPDATE "support_tickets"
SET "organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0'
WHERE "organizationId" IS NULL;

INSERT INTO "helpdesk_messages"
  ("id", "ticketId", "authorKind", "authorRef", "visibility", "body", "channel", "createdAt")
SELECT gen_random_uuid()::text, t."id", 'REQUESTER', t."userId", 'PUBLIC', t."message", 'PRODUCT', t."createdAt"
FROM "support_tickets" t
WHERE NOT EXISTS (
  SELECT 1 FROM "helpdesk_messages" m
  WHERE m."ticketId" = t."id" AND m."authorKind" = 'REQUESTER'
);

INSERT INTO "helpdesk_messages"
  ("id", "ticketId", "authorKind", "authorRef", "visibility", "body", "channel", "createdAt")
SELECT gen_random_uuid()::text, t."id", 'AGENT', NULL, 'PUBLIC', t."reply", 'PRODUCT',
       GREATEST(t."updatedAt", t."createdAt" + INTERVAL '1 millisecond')
FROM "support_tickets" t
WHERE t."reply" IS NOT NULL
  AND btrim(t."reply") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "helpdesk_messages" m
    WHERE m."ticketId" = t."id" AND m."authorKind" = 'AGENT'
  );

ALTER TABLE "support_tickets" ALTER COLUMN "organizationId" SET NOT NULL;
