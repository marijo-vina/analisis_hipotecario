-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "ocrText" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT;
