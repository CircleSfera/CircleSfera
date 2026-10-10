-- Help Desk: answers an agent keeps for a repeated question. Personal when
-- it has an owner, shared with the team when it has none.
CREATE TABLE "helpdesk_saved_replies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "ownerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_saved_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "helpdesk_saved_replies_organizationId_ownerRef_idx" ON "helpdesk_saved_replies"("organizationId", "ownerRef");

ALTER TABLE "helpdesk_saved_replies"
  ADD CONSTRAINT "helpdesk_saved_replies_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
