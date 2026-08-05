# Bureau Knockout Rules Specification

## Purpose

Hard rejection logic based on credit bureau data evaluated before bank viability assessment. These rules are absolute and binary — no advisor override is permitted in MVP.

## Requirements

### Requirement: Universal Score Knockout

The system MUST reject a case when the applicant's bureau score is below 500. If the bureau score is missing (null), the system SHALL skip this check — no rejection, no REQUIRES_REVIEW.

#### Scenario: Score below 500 rejected

- GIVEN an applicant with bureau score 480
- WHEN bureau knockout rules execute
- THEN the case is rejected with reason `BUREAU_SCORE_BELOW_MINIMUM`
- AND rejection applies to all banks

#### Scenario: Missing score skips check

- GIVEN an applicant with bureau score null
- WHEN bureau knockout rules execute
- THEN the score knockout is skipped entirely
- AND no rejection occurs from this rule

#### Scenario: Score at 500 passes

- GIVEN an applicant with bureau score 500
- WHEN bureau knockout rules execute
- THEN the universal score knockout does not reject

### Requirement: Bank-Specific Score Knockout

The system MUST reject a case for a specific bank when the score does not meet that bank's `minimumBureauScore`. Santander requires score >= 542. Banregio requires score > 629 (score <= 629 is rejected).

#### Scenario: Santander score below 542 rejected

- GIVEN applicant with bureau score 540
- WHEN evaluating Santander viability
- THEN Santander is rejected with reason `BUREAU_SCORE_BELOW_BANK_MINIMUM`

#### Scenario: Banregio score 629 rejected

- GIVEN applicant with bureau score 629
- WHEN evaluating Banregio viability
- THEN Banregio is rejected with reason `BUREAU_SCORE_BELOW_BANK_MINIMUM`

#### Scenario: Banregio score 630 passes

- GIVEN applicant with bureau score 630
- WHEN evaluating Banregio viability
- THEN Banregio is NOT rejected by score knockout

### Requirement: Quita/Quebranto Knockout

The system MUST reject when the bureau report contains quita or quebranto flags. Applies to all banks.

#### Scenario: Quita flag rejects all banks

- GIVEN applicant with bureau quita=true
- WHEN bureau knockout rules execute
- THEN all banks are rejected with reason `BUREAU_QUITA_QUEBRANTO`

#### Scenario: Quebranto flag rejects all banks

- GIVEN applicant with bureau quebranto=true
- WHEN bureau knockout rules execute
- THEN all banks are rejected with reason `BUREAU_QUITA_QUEBRANTO`

#### Scenario: No flags passes

- GIVEN applicant with quita=false and quebranto=false
- WHEN bureau knockout rules execute
- THEN the check passes for all banks

### Requirement: Santander MOP Late-Payment Knockout

The system MUST reject Santander when: (a) >= 2 past-due accounts (PV) each with balance > $3,000, OR (b) >= 3 past-due accounts of any amount. Applies only to Santander.

#### Scenario: 2 PV with >$3K each rejects Santander

- GIVEN applicant with 2 past-due accounts each balance $3,500
- WHEN evaluating Santander viability
- THEN Santander is rejected with reason `SANTANDER_MOP_LATE_PAYMENTS`

#### Scenario: 3 PV any amount rejects Santander

- GIVEN applicant with 3 past-due accounts each balance $100
- WHEN evaluating Santander viability
- THEN Santander is rejected with reason `SANTANDER_MOP_LATE_PAYMENTS`

#### Scenario: 2 PV below threshold does not reject

- GIVEN applicant with 2 past-due accounts each balance $2,000
- WHEN evaluating Santander viability
- THEN Santander is NOT rejected by MOP rule

#### Scenario: 1 PV with high balance does not reject

- GIVEN applicant with 1 past-due account balance $5,000
- WHEN evaluating Santander viability
- THEN Santander is NOT rejected by MOP rule

### Requirement: Knockout Pre-Pass Ordering

The system MUST evaluate bureau knockout rules before bank viability rules. Universal knockouts SHALL short-circuit — no per-bank evaluation needed.

#### Scenario: Universal knockout short-circuits

- GIVEN applicant with bureau score 400
- WHEN analysis executes
- THEN bureau knockout rejects all banks
- AND per-bank viability rules are not evaluated

#### Scenario: Bank-specific knockout is isolated

- GIVEN applicant with bureau score 600
- WHEN analysis executes
- THEN Banregio is rejected by bank-specific knockout
- AND other banks proceed to per-bank viability evaluation
