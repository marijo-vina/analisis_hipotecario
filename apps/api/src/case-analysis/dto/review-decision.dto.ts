import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReviewDecisionAction } from '../../generated/prisma/client';

/**
 * Input DTO for `POST /mortgage-cases/:caseId/analysis/:runId/review-decision`.
 *
 * `MARK_FALSE_POSITIVE` requires a non-empty `justification`; the controller
 * enforces that validation. `CONFIRM_ISSUE` and `CANCEL_CASE` do not.
 */
export class ReviewDecisionDto {
  @IsEnum(ReviewDecisionAction, {
    message: 'action must be one of MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE',
  })
  action!: ReviewDecisionAction;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  justification?: string;
}