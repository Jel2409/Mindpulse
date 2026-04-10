// Feature: mindpulse-rebuild, Properties 1-5: Auth route correctness

const request = require('supertest');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mindpulse_secret_2024';

// ---------------------------------------------------------------------------
// Mongoose mock — mirrors the pattern used in auth.test.js.
// The mockModel object is created once inside the factory; individual tests
// reconfigure its methods via mockResolvedValue / mockImplementation.
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

// Require app and models AFTER the mock is registered
const { app, User, Journal } = require('../server');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake persisted user object */
function fakeUser(name, email, hashedPassword) {
  return {
    _id:      '000000000000000000000001',
    name,
    email,
    password: hashedPassword,
    stats:    { sessions: 0, totalMinutes: 0, streak: 0, lastSession: null },
    save:     jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Property 1: Signup creates a user and returns a JWT
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------
describe('Property 1: Signup creates a user and returns a JWT', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'For any valid name/email/password, POST /api/auth/signup returns a JWT decoding to { id, name, email }',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name:     fc.string({ minLength: 1, maxLength: 40 }),
            email:    fc.emailAddress(),
            password: fc.string({ minLength: 6, maxLength: 50 }),
          }),
          async ({ name, email, password }) => {
            // No duplicate email
            User.findOne.mockResolvedValue(null);
            // create returns a fake persisted user
            User.create.mockImplementation(async (data) => ({
              _id:      '000000000000000000000001',
              name:     data.name,
              email:    data.email,
              password: data.password,
            }));

            const res = await request(app)
              .post('/api/auth/signup')
              .send({ name, email, password });

            if (res.status !== 200) return false;

            const { token } = res.body;
            if (!token) return false;

            const payload = jwt.verify(token, JWT_SECRET);
            return (
              typeof payload.id === 'string' &&
              payload.name      === name &&
              payload.email     === email
            );
          }
        ),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 2: Login round-trip returns a valid JWT
// Validates: Requirements 1.4
// ---------------------------------------------------------------------------
describe('Property 2: Login round-trip returns a valid JWT', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'For any registered user, POST /api/auth/login returns a JWT with 7d expiry decoding to correct identity',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name:     fc.string({ minLength: 1, maxLength: 40 }),
            email:    fc.emailAddress(),
            password: fc.string({ minLength: 6, maxLength: 50 }),
          }),
          async ({ name, email, password }) => {
            const hashed = await bcrypt.hash(password, 10);
            User.findOne.mockResolvedValue(fakeUser(name, email, hashed));

            const res = await request(app)
              .post('/api/auth/login')
              .send({ email, password });

            if (res.status !== 200) return false;

            const { token } = res.body;
            if (!token) return false;

            const payload = jwt.verify(token, JWT_SECRET);

            if (payload.name !== name || payload.email !== email) return false;

            // exp should be ~7 days from now (within a 60s tolerance)
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const expectedExp = Math.floor((Date.now() + sevenDaysMs) / 1000);
            return Math.abs(payload.exp - expectedExp) < 60;
          }
        ),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 3: Invalid credentials always return 400
// Validates: Requirements 1.6
// ---------------------------------------------------------------------------
describe('Property 3: Invalid credentials always return 400', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'For any email/password pair where the user does not exist, POST /api/auth/login returns 400 "Invalid credentials"',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email:    fc.emailAddress(),
            password: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async ({ email, password }) => {
            User.findOne.mockResolvedValue(null);

            const res = await request(app)
              .post('/api/auth/login')
              .send({ email, password });

            return res.status === 400 && res.body.error === 'Invalid credentials';
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );

  test(
    'For any email/password pair where the password is wrong, POST /api/auth/login returns 400 "Invalid credentials"',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name:            fc.string({ minLength: 1, maxLength: 40 }),
            email:           fc.emailAddress(),
            storedPassword:  fc.string({ minLength: 6, maxLength: 50 }),
            attemptPassword: fc.string({ minLength: 1, maxLength: 50 }),
          }).filter(({ storedPassword, attemptPassword }) => storedPassword !== attemptPassword),
          async ({ name, email, storedPassword, attemptPassword }) => {
            const hashed = await bcrypt.hash(storedPassword, 10);
            User.findOne.mockResolvedValue(fakeUser(name, email, hashed));

            const res = await request(app)
              .post('/api/auth/login')
              .send({ email, password: attemptPassword });

            return res.status === 400 && res.body.error === 'Invalid credentials';
          }
        ),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 4: Missing auth fields always return 400
// Validates: Requirements 1.7
// ---------------------------------------------------------------------------
describe('Property 4: Missing auth fields always return 400', () => {
  beforeEach(() => jest.clearAllMocks());

  // Every proper subset of {name, email, password} — each missing at least one field
  const ALL_FIELDS = ['name', 'email', 'password'];
  const INCOMPLETE_SUBSETS = (() => {
    const result = [];
    // mask 0b000 through 0b110 (skip 0b111 = all present)
    for (let mask = 0; mask < (1 << ALL_FIELDS.length) - 1; mask++) {
      result.push(ALL_FIELDS.filter((_, i) => (mask >> i) & 1));
    }
    return result; // 7 subsets
  })();

  test(
    'Any subset of signup fields with at least one missing returns 400',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name:     fc.string({ minLength: 1, maxLength: 40 }),
            email:    fc.emailAddress(),
            password: fc.string({ minLength: 6, maxLength: 50 }),
          }),
          fc.integer({ min: 0, max: INCOMPLETE_SUBSETS.length - 1 }),
          async (values, subsetIdx) => {
            const body = {};
            for (const field of INCOMPLETE_SUBSETS[subsetIdx]) {
              body[field] = values[field];
            }

            const res = await request(app)
              .post('/api/auth/signup')
              .send(body);

            return res.status === 400;
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});

// ---------------------------------------------------------------------------
// Property 5: Passwords are stored as bcrypt hashes
// Validates: Requirements 1.8
// ---------------------------------------------------------------------------
describe('Property 5: Passwords are stored as bcrypt hashes', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'After signup, the stored password is a valid bcrypt hash and never equals the plaintext',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name:     fc.string({ minLength: 1, maxLength: 40 }),
            email:    fc.emailAddress(),
            password: fc.string({ minLength: 6, maxLength: 50 }),
          }),
          async ({ name, email, password }) => {
            let capturedPassword = null;

            User.findOne.mockResolvedValue(null);
            User.create.mockImplementation(async (data) => {
              capturedPassword = data.password;
              return {
                _id:      '000000000000000000000001',
                name:     data.name,
                email:    data.email,
                password: data.password,
              };
            });

            const res = await request(app)
              .post('/api/auth/signup')
              .send({ name, email, password });

            if (res.status !== 200) return false;
            if (!capturedPassword) return false;

            // Must not equal plaintext
            if (capturedPassword === password) return false;

            // Must look like a bcrypt hash ($2b$ or $2a$ prefix)
            if (!/^\$2[ab]\$\d{2}\$/.test(capturedPassword)) return false;

            // bcrypt.compare must confirm the hash matches the original plaintext
            return bcrypt.compare(password, capturedPassword);
          }
        ),
        { numRuns: 100 }
      );
    },
    60000
  );
});
