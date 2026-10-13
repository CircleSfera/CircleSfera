-- The people who follow a Profile are told when it starts a live broadcast.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LIVE_STARTED';
