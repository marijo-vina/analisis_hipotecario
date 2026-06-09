/*
  Warnings:

  - You are about to drop the column `lastName` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `secondLastName` on the `Client` table. All the data in the column will be lost.
  - Added the required column `fullName` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paternalLastName` to the `Client` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Client" DROP COLUMN "lastName",
DROP COLUMN "secondLastName",
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "maternalLastName" TEXT,
ADD COLUMN     "paternalLastName" TEXT NOT NULL;
