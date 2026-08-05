import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Banks (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    // Login to get token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@gestion.com',
        password: 'admin123',
      });

    authToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/banks (GET)', () => {
    it('should return all banks with policy count', async () => {
      const response = await request(app.getHttpServer())
        .get('/banks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify structure of first bank
      const bank = response.body.data[0];
      expect(bank).toHaveProperty('id');
      expect(bank).toHaveProperty('code');
      expect(bank).toHaveProperty('name');
      expect(bank).toHaveProperty('incomeCriterion');
      expect(bank).toHaveProperty('debtCommitmentFactor');
      expect(bank).toHaveProperty('isActive');
      expect(bank).toHaveProperty('_count');
      expect(bank._count).toHaveProperty('policies');
      expect(typeof bank._count.policies).toBe('number');
    });

    it('should return 401 when accessing without token', async () => {
      await request(app.getHttpServer()).get('/banks').expect(401);
    });
  });

  describe('/banks/:code (GET)', () => {
    it('should return bank detail with policies for valid bank', async () => {
      const response = await request(app.getHttpServer())
        .get('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      const bank = response.body.data;

      expect(bank).toHaveProperty('id');
      expect(bank.code).toBe('BANORTE');
      expect(bank).toHaveProperty('name');
      expect(bank).toHaveProperty('policies');
      expect(Array.isArray(bank.policies)).toBe(true);

      // Verify policies are ordered by destination
      if (bank.policies.length > 1) {
        for (let i = 1; i < bank.policies.length; i++) {
          expect(bank.policies[i].destination >= bank.policies[i - 1].destination).toBe(
            true,
          );
        }
      }
    });

    it('should return 404 for non-existent bank', async () => {
      await request(app.getHttpServer())
        .get('/banks/INVALID_BANK')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('/banks/:code (PATCH)', () => {
    it('should update bank name', async () => {
      const originalName = 'Banorte';
      const updatedName = 'Banorte Updated';

      // Update
      const updateResponse = await request(app.getHttpServer())
        .patch('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: updatedName })
        .expect(200);

      expect(updateResponse.body.data.name).toBe(updatedName);

      // Verify
      const getResponse = await request(app.getHttpServer())
        .get('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.name).toBe(updatedName);

      // Restore
      await request(app.getHttpServer())
        .patch('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: originalName })
        .expect(200);
    });

    it('should update multiple fields', async () => {
      const updateData = {
        minimumBureauScore: 660,
        debtCommitmentFactor: 0.58,
      };

      const response = await request(app.getHttpServer())
        .patch('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.minimumBureauScore).toBe(
        updateData.minimumBureauScore,
      );
    });

    it('should return 404 when updating non-existent bank', async () => {
      await request(app.getHttpServer())
        .patch('/banks/INVALID_BANK')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test' })
        .expect(404);
    });

    it('should return 400 for invalid debtCommitmentFactor', async () => {
      await request(app.getHttpServer())
        .patch('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ debtCommitmentFactor: 1.5 })
        .expect(400);
    });

    it('should return 400 for invalid minimumBureauScore', async () => {
      await request(app.getHttpServer())
        .patch('/banks/BANORTE')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ minimumBureauScore: 200 })
        .expect(400);
    });
  });

  describe('/banks/:code/policies/:destination (PATCH)', () => {
    it('should upsert policy for valid bank and destination', async () => {
      const policyData = {
        minimumIncome: 16000,
        isActive: true,
      };

      const response = await request(app.getHttpServer())
        .patch('/banks/BANORTE/policies/ACQUISITION')
        .set('Authorization', `Bearer ${authToken}`)
        .send(policyData)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.destination).toBe('ACQUISITION');
    });

    it('should update existing policy', async () => {
      const policyData = {
        minimumIncome: 17000,
      };

      const response = await request(app.getHttpServer())
        .patch('/banks/BANORTE/policies/ACQUISITION')
        .set('Authorization', `Bearer ${authToken}`)
        .send(policyData)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    it('should return 404 for non-existent bank', async () => {
      await request(app.getHttpServer())
        .patch('/banks/INVALID_BANK/policies/ACQUISITION')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ minimumIncome: 15000 })
        .expect(404);
    });

    it('should return 400 for invalid destination', async () => {
      await request(app.getHttpServer())
        .patch('/banks/BANORTE/policies/INVALID_DESTINATION')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ minimumIncome: 15000 })
        .expect(400);
    });

    it('should accept null values for optional fields', async () => {
      const policyData = {
        minimumIncome: null,
        minimumPropertyValue: null,
      };

      const response = await request(app.getHttpServer())
        .patch('/banks/BANORTE/policies/ACQUISITION')
        .set('Authorization', `Bearer ${authToken}`)
        .send(policyData)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    it('should return 400 for negative minimumIncome', async () => {
      await request(app.getHttpServer())
        .patch('/banks/BANORTE/policies/ACQUISITION')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ minimumIncome: -100 })
        .expect(400);
    });
  });
});
