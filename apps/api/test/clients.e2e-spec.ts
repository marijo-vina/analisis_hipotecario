import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Clients (e2e)', () => {
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

  describe('/clients (POST)', () => {
    it('should create a client without RFC/CURP', async () => {
      const timestamp = Date.now() + Math.random();
      const clientData = {
        firstName: 'John',
        paternalLastName: 'Doe',
        email: `john.doe.${timestamp}@example.com`,
        phone: '1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fullName).toBe('John Doe');
      expect(response.body.email).toBe(clientData.email);
    });

    it('should create a client with valid RFC and CURP', async () => {
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const clientData = {
        firstName: 'Maria',
        paternalLastName: 'Garcia',
        maternalLastName: 'Lopez',
        rfc: `GARM800101${randomSuffix}A`.substring(0, 13),
        curp: `GARM800101HDFRRN${randomSuffix}`,
        email: `maria.garcia.${timestamp}.${randomSuffix}@example.com`,
        phone: '0987654321',
      };

      const response = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(201);

      expect(response.body.fullName).toBe('Maria Garcia Lopez');
    });

    it('should fail with 409 when creating a duplicate email', async () => {
      const timestamp = Date.now() + Math.random();
      const email = `duplicate.${timestamp}@example.com`;
      const clientData = {
        firstName: 'Dup',
        paternalLastName: 'Test',
        email: email,
        phone: '1112223333',
      };

      // First creation
      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(201);

      // Duplicate creation
      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(409);
    });

    it('should fail with 400 for invalid RFC format', async () => {
      const timestamp = Date.now() + Math.random();
      const clientData = {
        firstName: 'Invalid',
        paternalLastName: 'RFC',
        email: `invalid.rfc.${timestamp}@example.com`,
        phone: '1234567890',
        rfc: 'INVALID_RFC',
      };

      await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(400);
    });
  });

  describe('/clients (GET)', () => {
    it('should return paginated list of clients', async () => {
      const response = await request(app.getHttpServer())
        .get('/clients?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 5,
      });
      expect(response.body.meta).toHaveProperty('total');
    });

    it('should return 401 when accessing without token', async () => {
      await request(app.getHttpServer())
        .get('/clients')
        .expect(401);
    });
  });
});
