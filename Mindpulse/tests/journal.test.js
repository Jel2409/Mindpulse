// Feature: mindpulse-rebuild, Properties 14, 15, 17: Journal route correctness

const request = require('supertest');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mindpulse_secret_2024';

// ---------------------------------------------------------------------------
// Mongoose mock — same pattern as session.test.js
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

const { app, Journal } = require('../server');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign a JWT for a fake user */
function makeToken(id = '000000000000000000000001') {
  return jwt.sign({ id, name: 'Test User', email: 'test@example.com' }, JWT_SECRET, { expiresIn: '7d' });
}

const VALID_MOODS = ['Happy', 'Calm', 'Neutral', 'Anxious', 'Sad'];

// ---------------------------------------------------------------------------
// Property 14: Valid journal entries are persisted and returned
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------
describe('Property 14: Valid journal entries are persisted and returned', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'For any non-empty content and valid mood, POST /api/journal returns the saved entry with correct content, mood, and createdAt',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          fc.constantFrom(...VALID_MOODS),
          async (content, mood) => {
            const now = new Date().toISOString();
            const fakeEntry = {
              _id: '000000000000000000000099',
              userId: '000000000000000000000001',
              content,
              mood,
              createdAt: now,
            };

            Journal.create.mockResolvedValue(fakeEntry);

            const token = makeToken();
            const res = await request(app)
              .post('/api/journal')
              .set('Authorization', `Bearer ${token}`)
              .send({ content, mood });

            if (res.status !== 200) return false;

            const entry = res.body;
            return (
              entry.content === content &&
              entry.mood === mood &&
              entry.createdAt != null
            );
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});

// ---------------------------------------------------------------------------
// Property 15: Empty or whitespace journal content is rejected
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------
describe('Property 15: Empty or whitespace journal content is rejected', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'For any whitespace-only string (including empty string), POST /api/journal returns 400',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(''),
            fc.string().map(s => s.replace(/[^\s]/g, ' ')).filter(s => s.trim() === '')
          ),
          async (content) => {
            const token = makeToken();
            const res = await request(app)
              .post('/api/journal')
              .set('Authorization', `Bearer ${token}`)
              .send({ content, mood: 'Calm' });

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
// Property 17: Deleting a journal entry removes it from the list
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------
describe('Property 17: Deleting a journal entry removes it from the list', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'After deleting an entry via DELETE /api/journal/:id, GET /api/journal does not contain that entry',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          fc.constantFrom(...VALID_MOODS),
          async (content, mood) => {
            const entryId = '000000000000000000000042';
            const now = new Date().toISOString();
            const fakeEntry = {
              _id: entryId,
              userId: '000000000000000000000001',
              content,
              mood,
              createdAt: now,
            };

            // POST creates the entry
            Journal.create.mockResolvedValue(fakeEntry);
            // DELETE succeeds
            Journal.findOneAndDelete.mockResolvedValue(fakeEntry);
            // GET returns empty list after deletion
            Journal.find.mockReturnValue({
              sort: jest.fn().mockReturnThis(),
              limit: jest.fn().mockResolvedValue([]),
            });

            const token = makeToken();

            // Create the entry
            const postRes = await request(app)
              .post('/api/journal')
              .set('Authorization', `Bearer ${token}`)
              .send({ content, mood });

            if (postRes.status !== 200) return false;

            // Delete the entry
            const deleteRes = await request(app)
              .delete(`/api/journal/${entryId}`)
              .set('Authorization', `Bearer ${token}`);

            if (deleteRes.status !== 204) return false;

            // Verify it's gone from the list
            const getRes = await request(app)
              .get('/api/journal')
              .set('Authorization', `Bearer ${token}`);

            if (getRes.status !== 200) return false;

            const entries = getRes.body;
            return !entries.some(e => e._id === entryId);
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});
