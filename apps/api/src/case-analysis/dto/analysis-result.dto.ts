import type {
  AnalysisExecutionStatus,
  AnalysisOutcome,
} from '../../generated/prisma/client';
import type { RuleDetail } from '../analysis-rule.interface';

/**
 * Response contract for `POST /mortgage-cases/:caseId/analyze` and
 * `GET /mortgage-cases/:caseId/analysis/latest`.
 *
 * Mirrors the persisted `AnalysisRun` record without mutability concerns.
 */
export class AnalysisResultDto {
  runId!: string;
  executionStatus!: AnalysisExecutionStatus;
  outcome!: AnalysisOutcome;
  summary!: string;
  detail!: RuleDetail;
  executionMetadata!: {
    timestamp: string;
    triggeredBy: string;
  };
}