-- Since when the payouts of a banned person are held at the provider.
ALTER TABLE "users" ADD COLUMN "payoutsHeldAt" TIMESTAMP(3);
