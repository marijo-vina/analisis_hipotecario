-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ADVISOR');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NOMINA', 'ESTADO_CUENTA', 'BURO', 'INE', 'COMPROBANTE_DOMICILIO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADVISOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "secondLastName" TEXT,
    "rfc" TEXT,
    "curp" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortgageCase" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "creditTypeId" INTEGER NOT NULL,
    "statusId" INTEGER NOT NULL,
    "requestedAmount" DECIMAL(65,30) NOT NULL,
    "propertyValue" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MortgageCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "mortgageCaseId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CreditType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStatus" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CaseStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_rfc_key" ON "Client"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "Client_curp_key" ON "Client"("curp");

-- CreateIndex
CREATE UNIQUE INDEX "CreditType_code_key" ON "CreditType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CaseStatus_code_key" ON "CaseStatus"("code");

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_creditTypeId_fkey" FOREIGN KEY ("creditTypeId") REFERENCES "CreditType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "CaseStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_mortgageCaseId_fkey" FOREIGN KEY ("mortgageCaseId") REFERENCES "MortgageCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
