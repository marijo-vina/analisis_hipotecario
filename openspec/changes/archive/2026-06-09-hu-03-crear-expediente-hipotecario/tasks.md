# Tasks: HU-03 — Crear Expediente Hipotecario

## Phase 1: Foundation (Schema + Seeds)

- [x] 1.1 Modify `prisma/schema.prisma`: add `enum PersonType { SALARIED }`, add `personType`, `propertyLocation`, `estimatedTermMonths` to `MortgageCase`; change `requestedAmount` and `propertyValue` to `Decimal?`
- [x] 1.2 Run `npx prisma migrate dev --name add_mortgage_case_preprofiling_fields` and `npx prisma generate`
- [x] 1.3 Modify `prisma/seed.ts`: add upserts for 6 CreditType rows and 5 CaseStatus rows (incl. `PENDING_DOCUMENTS`) using `where: { code }`
- [x] 1.4 Run `npx prisma db seed` and verify catalog rows exist

## Phase 2: Catalogs Module (GET /credit-types, GET /case-statuses)

- [x] 2.1 TDD-RED: Create `src/catalogs/catalogs.service.spec.ts` — test `getCreditTypes()` and `getCaseStatuses()` mock `prisma.creditType.findMany` / `prisma.caseStatus.findMany`
- [x] 2.2 TDD-GREEN: Create `src/catalogs/catalogs.service.ts` — implement both methods returning `{ data: [...] }`
- [x] 2.3 TDD-RED: Create `src/catalogs/catalogs.controller.spec.ts` — test GET /credit-types and GET /case-statuses return 200
- [x] 2.4 TDD-GREEN: Create `src/catalogs/catalogs.controller.ts` — `@Controller()` with `@Get('credit-types')` and `@Get('case-statuses')` (no auth guard)
- [x] 2.5 Create `src/catalogs/catalogs.module.ts` — import PrismaModule, provide service, export controller

## Phase 3: MortgageCases Module (Core Logic)

- [x] 3.1 TDD-RED: Create `src/mortgage-cases/dto/create-mortgage-case.dto.spec.ts` — validate required fields, reject advisorId/statusId, optional >0, personType only SALARIED
- [x] 3.2 TDD-GREEN: Create `src/mortgage-cases/dto/create-mortgage-case.dto.ts` — `clientId` @IsUUID, `creditTypeId` @IsInt @Min(1), optionals with @IsOptional + @Min, `personType` @IsIn(['SALARIED'])
- [x] 3.3 Create `src/mortgage-cases/dto/query-mortgage-case.dto.ts` — page/limit with defaults
- [x] 3.4 TDD-RED: Create `src/mortgage-cases/mortgage-cases.service.spec.ts` — test create (advisorId from arg, status resolved, defaults), findAll (pagination), findOne (with includes, 404)
- [x] 3.5 TDD-GREEN: Create `src/mortgage-cases/mortgage-cases.service.ts` — `create(dto, advisorId)`, `findAll(query)`, `findOne(id)` with Prisma includes
- [x] 3.6 TDD-RED: Create `src/mortgage-cases/mortgage-cases.controller.spec.ts` — test POST 201, GET / 200, GET /:id 200, 401 without guard
- [x] 3.7 TDD-GREEN: Create `src/mortgage-cases/mortgage-cases.controller.ts` — `@UseGuards(JwtAuthGuard)`, POST/GET/GET:id; extract `req.user.id` for create
- [x] 3.8 Create `src/mortgage-cases/mortgage-cases.module.ts` — import PrismaModule, provide service, export controller

## Phase 4: Wiring + API Contracts

- [x] 4.1 Modify `src/app.module.ts` — import CatalogsModule and MortgageCasesModule
- [x] 4.2 Modify `specs/04-api-contracts.md` — remove advisorId/statusId from POST body, add optional fields, mark PATCH endpoints as deferred to HU-04

## Phase 5: E2E Tests

- [x] 5.1 Create `test/mortgage-cases.e2e-spec.ts` — POST with/without optionals, validate status=PENDING_DOCUMENTS, reject advisorId (400), 401 without token
- [x] 5.2 Add GET /mortgage-cases e2e — paginated list, 401 without token
- [x] 5.3 Add GET /mortgage-cases/:id e2e — detail with relations, 404 for nonexistent id
- [x] 5.4 Run full test suite: `npm run test` + `npm run test:e2e` — all green
