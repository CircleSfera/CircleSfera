-- Help Desk: what each existing ticket says becomes messages. The ticket's
-- own message is the first message of the requester; its reply, if it has
-- one, is a public message of the team. Safe to run twice: a ticket that
-- already has that message is skipped. The old columns are left as they are.

INSERT INTO "helpdesk_messages"
  ("id", "ticketId", "authorKind", "authorRef", "visibility", "body", "channel", "createdAt")
SELECT gen_random_uuid()::text, t."id", 'REQUESTER', t."userId", 'PUBLIC', t."message", 'PRODUCT', t."createdAt"
FROM "support_tickets" t
WHERE NOT EXISTS (
  SELECT 1 FROM "helpdesk_messages" m
  WHERE m."ticketId" = t."id" AND m."authorKind" = 'REQUESTER'
);

-- Who answered was not stored: the author of an old reply is left empty.
-- Its time is the last change of the ticket, never before the opening.
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

-- Tickets opened while the previous change was being deployed.
UPDATE "support_tickets"
SET "organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0'
WHERE "organizationId" IS NULL;
