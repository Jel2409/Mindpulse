// Feature: mindpulse-rebuild, Property 19: Protected routes reject requests without a valid JWT

const request = require('supertest');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');

// Mock mongoose to avoid real DB connection
jest.mock('mongoose', () => {
  const mockModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  // Schema constructor that supports new mongoose.Schema({...})
  function MockSchema() {}
  MockSchema.Types = { ObjectId: 'ObjectId' };

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    Schema: MockSchema,
    model: jest.fn(() => mockModel),
  };
});

const { app } = require('../server');

// All protected routes to test
const PROTECTED_ROUTES = [
  { method: 'get',    path: '/api/user/profile' },
  { method: 'put',    path: '/api/user/profile' },
  { method: 'post',   path: '/api/user/session' },
  { method: 'get',    path: '/api/journal' },
  { method: 'post',   path: '/api/journal' },
  { method: 'delete', path: '/api/journal/000000000000000000000001' },
];

// Helper to send a request with a given Authorization header value (or none)
function makeRequest(method, path, authHeader) {
  const req = request(app)[method](path);
  if (authHeader !== undefined) {
    req.set('Authorization', authHeader);
  }
  return req;
}

describe('Property 19: Protected routes reject requests without a valid JWT', () => {

  // --- No Authorization header ---
  describe('No Authorization header returns 401', () => {
    test.each(PROTECTED_ROUTES)(
      '$method $path — no auth header → 401',
      async ({ method, path }) => {
        const res = await makeRequest(method, path, undefined);
        expect(res.status).toBe(401);
      }
    );
  });

  // --- Invalid token string ---
  describe('Invalid token string returns 401', () => {
    test.each(PROTECTED_ROUTES)(
      '$method $path — invalid token → 401',
      async ({ method, path }) => {
        const res = await makeRequest(method, path, 'Bearer this.is.not.a.valid.jwt');
        expect(res.status).toBe(401);
      }
    );
  });

  // --- Expired token ---
  describe('Expired token returns 401', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'mindpulse_secret_2024';
    const expiredToken = jwt.sign(
      { id: '000000000000000000000001', name: 'Test', email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: -1 } // already expired
    );

    test.each(PROTECTED_ROUTES)(
      '$method $path — expired token → 401',
      async ({ method, path }) => {
        const res = await makeRequest(method, path, `Bearer ${expiredToken}`);
        expect(res.status).toBe(401);
      }
    );
  });

  // --- Property-based test: arbitrary invalid token strings always return 401 ---
  describe('Property-based: arbitrary non-JWT strings always return 401', () => {
    test.each(PROTECTED_ROUTES)(
      '$method $path — arbitrary invalid token → 401 (fast-check, 100 iterations)',
      async ({ method, path }) => {
        await fc.assert(
          fc.asyncProperty(
            // Generate strings that are definitely not valid JWTs
            fc.oneof(
              fc.constant(''),
              fc.constant('Bearer'),
              fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('.')),
              fc.string({ minLength: 1, maxLength: 50 })
            ),
            async (invalidToken) => {
              const res = await makeRequest(method, path, `Bearer ${invalidToken}`);
              return res.status === 401;
            }
          ),
          { numRuns: 100 }
        );
      },
      30000
    );
  });

});
