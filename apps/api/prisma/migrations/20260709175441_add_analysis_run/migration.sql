-- CreateEnum
CREATE TYPE "AnalysisExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "AnalysisOutcome" AS ENUM ('PASS', 'PARTIAL', 'FAIL');

-- CreateEnum
CREATE TYPE "ReviewDecisionAction" AS ENUM ('MARK_FALSE_POSITIVE', 'CONFIRM_ISSUE', 'CANCEL_CASE');

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "mortgageCaseId" TEXT NOT NULL,
    "executionStatus" "AnalysisExecutionStatus" NOT NULL,
    "outcome" "AnalysisOutcome" NOT NULL,
    "detail" JSONB NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisAlert" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "AnalysisAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "action" "ReviewDecisionAction" NOT NULL,
    "justification" TEXT,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_mortgageCaseId_fkey" FOREIGN KEY ("mortgageCaseId") REFERENCES "MortgageCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisAlert" ADD CONSTRAINT "AnalysisAlert_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
