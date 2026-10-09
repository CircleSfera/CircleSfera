-- Help Desk: a ticket can wait for its requester. A new value of an enum is
-- added in its own migration: it cannot be used in the transaction that
-- adds it.
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'WAITING';
