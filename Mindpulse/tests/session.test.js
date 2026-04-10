// Feature: mindpulse-rebuild, Property 8: Session completion records correct duration

const request = require('supertest');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mindpulse_secret_2024';

// ---------------------------------------------------------------------------
// Mongoose mock — same pattern as server.test.js
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

const { app, User } = require('../server');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign a JWT for a fake user */
function makeToken(id = '000000000000000000000001') {
  return jwt.sign({ id, name: 'Test User', email: 'test@example.com' }, JWT_SECRET, { expiresIn: '7d' });
}

/** Build a fake user with configurable lastSession */
function fakeUser(lastSession = null, streak = 0) {
  return {
    _id: '000000000000000000000001',
    stats: {
      sessions:     0,
      totalMinutes: 0,
      streak,
      lastSession,
    },
    save: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Property 8: Session completion records correct duration
// Validates: Requirements 3.5, 4.7
// ---------------------------------------------------------------------------
describe('Property 8: Session completion records correct duration', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'For any minutes value, POST /api/user/session increases totalMinutes by exactly that amount',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 120 }),
          async (minutes) => {
            const initialMinutes = 50;
            const user = fakeUser(null, 0);
            user.stats.totalMinutes = initialMinutes;

            User.findById.mockResolvedValue(user);

            const token = makeToken();
            const res = await request(app)
              .post('/api/user/session')
              .set('Authorization', `Bearer ${token}`)
              .send({ minutes });

            if (res.status !== 200) return false;

            const { stats } = res.body;
            return stats.totalMinutes === initialMinutes + minutes;
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});

// ---------------------------------------------------------------------------
// Unit tests: Streak calculation logic
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------
describe('Streak calculation logic', () => {
  beforeEach(() => jest.clearAllMocks());

  const token = makeToken();

  test("yesterday's session increments streak by 1", async () => {
    const yesterday = new Date(Date.now() - 86400000);
    const user = fakeUser(yesterday, 3);

    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/user/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 10 });

    expect(res.status).toBe(200);
    expect(res.body.stats.streak).toBe(4);
  });

  test("same-day session does not change streak", async () => {
    const today = new Date();
    const user = fakeUser(today, 5);

    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/user/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 10 });

    expect(res.status).toBe(200);
    expect(res.body.stats.streak).toBe(5);
  });

  test("gap (more than 1 day ago) resets streak to 1", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    const user = fakeUser(twoDaysAgo, 7);

    User.findById.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/user/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 10 });

    expect(res.status).toBe(200);
    expect(res.body.stats.streak).toBe(1);
  });
});
