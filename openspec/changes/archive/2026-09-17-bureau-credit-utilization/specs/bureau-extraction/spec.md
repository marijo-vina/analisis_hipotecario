# Delta for Bureau Extraction

## ADDED Requirements

### Requirement: Persist Account Number on Extract

The system MUST copy `accountNumber` from layout and coordinate merge onto persisted credit JSONB. The system MUST NOT persist derived utilization. Gemini `credit-bureau.schema.md` MUST remain unchanged (MUST NOT add `accountNumber` or utilization). Opening stored bureaus MUST NOT silently re-extract.

#### Scenario: Layout and coordinate copy

- GIVEN layout or coordinate credit with `accountNumber` "10002030"
- WHEN merge writes `credits[]`
- THEN that credit MUST include `accountNumber` "10002030"
- AND MUST NOT include a utilization field

#### Scenario: Gemini schema unchanged

- GIVEN Gemini schema construction
- WHEN the prompt schema is serialized
- THEN it MUST NOT add `accountNumber` or utilization

#### Scenario: No silent re-extract

- GIVEN a stored bureau
- WHEN the advisor opens the Buro tab
- THEN the system MUST NOT re-run OCR or Gemini solely for utilization or last-4
