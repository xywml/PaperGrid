-- Add password protection fields to Post
ALTER TABLE "Post" ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "passwordHash" TEXT;
