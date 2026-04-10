// Feature: mindpulse-rebuild, Integration and Smoke Tests

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mindpulse_secret_2024';

// ---------------------------------------------------------------------------
// Mongoose mock — same pattern as other test files
// ---------------------------------------------------------------------------
jest.mock('mongoose', () => {
  const mockModel = {
    findOne:           jest.fn(),
    create:            jest.fn(),
    findById:          jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndDelete:  jest.fn(),
    find:              jest.fn(),
  };

  function MockSchema() {}
  MockSchema.Types = { ObjectId: 'ObjectId' };

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    Schema:  MockSchema,
    model:   jest.fn(() => mockModel),
  };
});

const { app, User, Journal } = require('../server');

// ---------------------------------------------------------------------------
// Task 20.1: Integration test — full signup → login → session → journal flow
// Validates: Requirements 1.3, 1.4, 3.5, 7.2
// ---------------------------------------------------------------------------
describe('Integration: full signup → login → session → journal flow', () => {
  beforeEach(() => jest.clearAllMocks());

  test('happy path: signup creates user and returns JWT, login returns JWT, session is recorded, journal entry is created and retrieved', async () => {
    const name = 'Alice';
    const email = 'alice@example.com';
    const password = 'securepass123';
    const userId = '000000000000000000000001';

    // --- Step 1: Signup ---
    User.findOne.mockResolvedValue(null); // no duplicate email
    User.create.mockImplementation(async (data) => ({
      _id:      userId,
      name:     data.name,
      email:    data.email,
      password: data.password,
    }));

    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({ name, email, password });

    expect(signupRes.status).toBe(200);
    expect(signupRes.body.token).toBeDefined();
    expect(signupRes.body.user.name).toBe(name);
    expect(signupRes.body.user.email).toBe(email);

    const signupPayload = jwt.verify(signupRes.body.token, JWT_SECRET);
    expect(signupPayload.name).toBe(name);
    expect(signupPayload.email).toBe(email);

    // --- Step 2: Login with same credentials ---
    const hashed = await bcrypt.hash(password, 10);
    User.findOne.mockResolvedValue({
      _id:      userId,
      name,
      email,
      password: hashed,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    const loginPayload = jwt.verify(loginRes.body.token, JWT_SECRET);
    expect(loginPayload.name).toBe(name);
    expect(loginPayload.email).toBe(email);

    const authToken = loginRes.body.token;

    // --- Step 3: POST /api/user/session records session ---
    const fakeUser = {
      _id: userId,
      stats: { sessions: 0, totalMinutes: 0, streak: 0, lastSession: null },
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(fakeUser);

    const sessionRes = await request(app)
      .post('/api/user/session')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ minutes: 15 });

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.stats.sessions).toBe(1);
    expect(sessionRes.body.stats.totalMinutes).toBe(15);

    // --- Step 4: POST /api/journal creates entry ---
    const content = 'Feeling calm after meditation.';
    const mood = 'Calm';
    const entryId = '000000000000000000000099';
    const createdAt = new Date().toISOString();

    const fakeEntry = { _id: entryId, userId, content, mood, createdAt };
    Journal.create.mockResolvedValue(fakeEntry);

    const journalPostRes = await request(app)
      .post('/api/journal')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content, mood });

    expect(journalPostRes.status).toBe(200);
    expect(journalPostRes.body.content).toBe(content);
    expect(journalPostRes.body.mood).toBe(mood);

    // --- Step 5: GET /api/journal returns the entry ---
    Journal.find.mockReturnValue({
      sort:  jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([fakeEntry]),
    });

    const journalGetRes = await request(app)
      .get('/api/journal')
      .set('Authorization', `Bearer ${authToken}`);

    expect(journalGetRes.status).toBe(200);
    expect(journalGetRes.body).toHaveLength(1);
    expect(journalGetRes.body[0].content).toBe(content);
    expect(journalGetRes.body[0].mood).toBe(mood);
  });
});

// ---------------------------------------------------------------------------
// Task 20.2: Smoke tests — server starts, all API routes respond, DB env var used
// Validates: Requirements 11.1, 11.2, 11.3
// ---------------------------------------------------------------------------
describe('Smoke tests: server starts and all API routes respond', () => {
  beforeEach(() => jest.clearAllMocks());

  // 11.1 — Server serves public/index.html
  test('GET / serves public/index.html (200 or redirect)', async () => {
    const res = await request(app).get('/');
    expect([200, 301, 302]).toContain(res.status);
  });

  // 11.2 — All API routes return non-404
  const protectedRoutes = [
    { method: 'get',    path: '/api/user/profile' },
    { method: 'put',    path: '/api/user/profile' },
    { method: 'post',   path: '/api/user/session' },
    { method: 'get',    path: '/api/journal' },
    { method: 'post',   path: '/api/journal' },
    { method: 'delete', path: '/api/journal/000000000000000000000001' },
  ];

  const publicRoutes = [
    { method: 'post', path: '/api/auth/signup' },
    { method: 'post', path: '/api/auth/login' },
    { method: 'get',  path: '/api/meditations' },
  ];

  for (const { method, path } of protectedRoutes) {
    test(`${method.toUpperCase()} ${path} returns non-404 (401 without auth)`, async () => {
      const res = await request(app)[method](path);
      expect(res.status).not.toBe(404);
    });
  }

  for (const { method, path } of publicRoutes) {
    test(`${method.toUpperCase()} ${path} returns non-404`, async () => {
      const res = await request(app)[method](path).send({});
      expect(res.status).not.toBe(404);
    });
  }

  // 11.3 — MONGO_URI env var is read by the server
  test('server reads MONGO_URI from process.env', () => {
    const serverSource = require('fs').readFileSync(
      require('path').join(__dirname, '../server.js'),
      'utf8'
    );
    expect(serverSource).toMatch(/process\.env\.MONGO_URI/);
  });
});
