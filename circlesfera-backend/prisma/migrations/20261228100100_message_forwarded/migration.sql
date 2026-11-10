-- A message can be a copy forwarded from another chat. A constant default
-- adds the column without rewriting the table; every existing row is false.
ALTER TABLE "messages" ADD COLUMN "isForwarded" BOOLEAN NOT NULL DEFAULT false;
