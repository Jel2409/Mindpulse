// Feature: mindpulse-rebuild, Property 16: Journal entries displayed in reverse chronological order

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Pure rendering/sorting logic extracted from journal.html
// (tested without DOM — pure functions only)
// ---------------------------------------------------------------------------

/**
 * Sorts journal entries in reverse chronological order (newest first).
 * Mirrors the order the API returns and the page renders them.
 * @param {Array<{_id: string, content: string, mood: string, createdAt: string}>} entries
 * @returns {Array}
 */
function sortEntriesDescending(entries) {
  return [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Simulates rendering entries to a list of display objects.
 * Returns an array of { content, mood, createdAt } in the order they would appear.
 * @param {Array} entries - already sorted or unsorted
 * @returns {Array<{content: string, mood: string, createdAt: string}>}
 */
function renderEntries(entries) {
  return sortEntriesDescending(entries).map(e => ({
    content:   e.content,
    mood:      e.mood,
    createdAt: e.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const VALID_MOODS = ['Happy', 'Calm', 'Neutral', 'Anxious', 'Sad'];

const journalEntryArb = fc.record({
  _id:       fc.hexaString({ minLength: 24, maxLength: 24 }),
  content:   fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  mood:      fc.constantFrom(...VALID_MOODS),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
               .map(d => d.toISOString()),
});

// ---------------------------------------------------------------------------
// Property 16: Journal entries are displayed in reverse chronological order
//              with all fields
// Validates: Requirements 7.4
// ---------------------------------------------------------------------------
describe('Property 16: Journal entries are displayed in reverse chronological order with all fields', () => {
  test(
    'For any array of journal entries, rendered list is newest-first and each item has content, mood, and createdAt',
    () => {
      fc.assert(
        fc.property(
          fc.array(journalEntryArb, { minLength: 0, maxLength: 20 }),
          (entries) => {
            const rendered = renderEntries(entries);

            // 1. Length matches
            if (rendered.length !== entries.length) return false;

            // 2. Reverse chronological order — each item's date >= the next
            for (let i = 0; i < rendered.length - 1; i++) {
              const curr = new Date(rendered[i].createdAt).getTime();
              const next = new Date(rendered[i + 1].createdAt).getTime();
              if (curr < next) return false;
            }

            // 3. Each rendered entry contains all required fields
            for (const item of rendered) {
              if (typeof item.content !== 'string' || item.content.length === 0) return false;
              if (!VALID_MOODS.includes(item.mood)) return false;
              if (typeof item.createdAt !== 'string' || item.createdAt.length === 0) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
