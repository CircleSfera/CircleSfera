-- A message may carry a GIF from GIPHY. Only adds a nullable column.
ALTER TABLE "messages" ADD COLUMN "gif" JSONB;
