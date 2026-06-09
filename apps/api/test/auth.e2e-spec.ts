import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/login (POST)', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@gestion.com',
          password: 'admin123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
    });

    it('should fail to login with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@gestion.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });

  describe('Route Protection', () => {
    it('/clients (GET) - should return 401 Unauthorized without token', async () => {
      await request(app.getHttpServer())
        .get('/clients')
        .expect(401);
    });

    it('/clients (GET) - should return 200 OK with valid token', async () => {
      // Login first
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@gestion.com',
          password: 'admin123',
        });

      const token = loginResponse.body.access_token;

      await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
