import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Mortgage Cases + Catalogs (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let clientId: string;
  let creditTypeId: number;

  const loginAsAdmin = async () => {
    const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@gestion.com',
      password: 'admin123',
    });

    return loginResponse.body.access_token as string;
  };

  const createClient = async (token: string) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const response = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Caso',
        paternalLastName: 'Hipotecario',
        email: `hu03.${unique}@example.com`,
        phone: '5512345678',
      })
      .expect(201);

    return response.body.id as string;
  };

  const getFirstCreditTypeId = async (token: string) => {
    const response = await request(app.getHttpServer())
      .get('/credit-types')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);

    return response.body.data[0].id as number;
  };

  const createMortgageCase = async (
    token: string,
    body: Record<string, unknown>,
    status = 201,
  ) => {
    return request(app.getHttpServer())
      .post('/mortgage-cases')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(status);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    authToken = await loginAsAdmin();
    clientId = await createClient(authToken);
    creditTypeId = await getFirstCreditTypeId(authToken);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /credit-types and GET /case-statuses', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/credit-types').expect(401);
      await request(app.getHttpServer()).get('/case-statuses').expect(401);
    });

    it('should return 200 + { data: [...] } with valid token', async () => {
      const creditTypesResponse = await request(app.getHttpServer())
        .get('/credit-types')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(creditTypesResponse.body.data)).toBe(true);

      const caseStatusesResponse = await request(app.getHttpServer())
        .get('/case-statuses')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(caseStatusesResponse.body.data)).toBe(true);
    });
  });

  describe('POST /mortgage-cases', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/mortgage-cases')
        .send({ clientId, creditTypeId })
        .expect(401);
    });

    it('should create a mortgage case with minimal fields', async () => {
      const response = await createMortgageCase(authToken, { clientId, creditTypeId });

      expect(response.body.id).toBeDefined();
      expect(response.body.clientId).toBe(clientId);
      expect(response.body.creditTypeId).toBe(creditTypeId);
      expect(response.body.status.code).toBe('PENDING_DOCUMENTS');
      expect(response.body.personType).toBe('SALARIED');
      expect(response.body.propertyLocation).toBeNull();
      expect(response.body.requestedAmount).toBeNull();
      expect(response.body.propertyValue).toBeNull();
      expect(response.body.estimatedTermMonths).toBeNull();
    });

    it('should create a mortgage case with optional fields', async () => {
      const response = await createMortgageCase(authToken, {
        clientId,
        creditTypeId,
        personType: 'SALARIED',
        propertyLocation: 'CABA',
        requestedAmount: 1500000,
        propertyValue: 2200000,
        estimatedTermMonths: 240,
        notes: 'Caso con opcionales',
      });

      expect(response.body.personType).toBe('SALARIED');
      expect(response.body.propertyLocation).toBe('CABA');
      expect(Number(response.body.requestedAmount)).toBe(1500000);
      expect(Number(response.body.propertyValue)).toBe(2200000);
      expect(response.body.estimatedTermMonths).toBe(240);
    });

    it('should return 400 when advisorId is sent in body', async () => {
      await createMortgageCase(
        authToken,
        {
          clientId,
          creditTypeId,
          advisorId: '00000000-0000-0000-0000-000000000001',
        },
        400,
      );
    });

    it('should return 400 when statusId is sent in body', async () => {
      await createMortgageCase(
        authToken,
        {
          clientId,
          creditTypeId,
          statusId: 2,
        },
        400,
      );
    });

    it('should return 400 when requestedAmount <= 0', async () => {
      await createMortgageCase(
        authToken,
        {
          clientId,
          creditTypeId,
          requestedAmount: 0,
        },
        400,
      );
    });

    it('should return 400 when propertyValue <= 0', async () => {
      await createMortgageCase(
        authToken,
        {
          clientId,
          creditTypeId,
          propertyValue: -1,
        },
        400,
      );
    });

    it('should return 400 when estimatedTermMonths <= 0', async () => {
      await createMortgageCase(
        authToken,
        {
          clientId,
          creditTypeId,
          estimatedTermMonths: 0,
        },
        400,
      );
    });
  });

  describe('GET /mortgage-cases', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/mortgage-cases').expect(401);
    });

    it('should return 200 with token', async () => {
      const response = await request(app.getHttpServer())
        .get('/mortgage-cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          page: 1,
          limit: 10,
        }),
      );
    });
  });

  describe('GET /mortgage-cases/:id', () => {
    it('should return 401 without token', async () => {
      const created = await createMortgageCase(authToken, { clientId, creditTypeId });

      await request(app.getHttpServer()).get(`/mortgage-cases/${created.body.id}`).expect(401);
    });

    it('should return 200 with token for existing mortgage case', async () => {
      const created = await createMortgageCase(authToken, { clientId, creditTypeId });

      const response = await request(app.getHttpServer())
        .get(`/mortgage-cases/${created.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(created.body.id);
      expect(response.body.client).toBeDefined();
      expect(response.body.advisor).toBeDefined();
      expect(response.body.creditType).toBeDefined();
      expect(response.body.status.code).toBe('PENDING_DOCUMENTS');
    });

    it('should return 404 for non-existing mortgage case', async () => {
      await request(app.getHttpServer())
        .get('/mortgage-cases/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /mortgage-cases/:id (removed)', () => {
    it('should return 404 because the PATCH route has been removed', async () => {
      const created = await createMortgageCase(authToken, { clientId, creditTypeId });

      await request(app.getHttpServer())
        .patch(`/mortgage-cases/${created.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ statusCode: 'DOCUMENTS_UPLOADED' })
        .expect(404);
    });
  });

  describe('GET /case-statuses returns new 4 status codes', () => {
    it('should return exactly the 4 simplified statuses', async () => {
      const response = await request(app.getHttpServer())
        .get('/case-statuses')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const codes = response.body.data.map((s: { code: string }) => s.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'PENDING_DOCUMENTS',
          'DOCUMENTS_UPLOADED',
          'DOCUMENTS_PROCESSED',
          'PRELIMINARY_RESULT',
        ]),
      );
      // Old status codes should NOT be present
      expect(codes).not.toContain('PROCESSING');
      expect(codes).not.toContain('IN_REVIEW');
      expect(codes).not.toContain('CLOSED');
    });
  });
});
