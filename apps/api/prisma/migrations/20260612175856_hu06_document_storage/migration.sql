/*
  Warnings:

  - You are about to drop the column `documentType` on the `Document` table. All the data in the column will be lost.
  - Added the required column `documentStatusId` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `documentTypeId` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" DROP COLUMN "documentType",
ADD COLUMN     "documentStatusId" INTEGER NOT NULL,
ADD COLUMN     "documentTypeId" INTEGER NOT NULL,
ADD COLUMN     "storagePath" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "fileUrl" DROP NOT NULL;

-- DropEnum
DROP TYPE "DocumentType";

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentStatus" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_code_key" ON "DocumentType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentStatus_code_key" ON "DocumentStatus"("code");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentStatusId_fkey" FOREIGN KEY ("documentStatusId") REFERENCES "DocumentStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
