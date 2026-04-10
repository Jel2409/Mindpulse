// Feature: mindpulse-rebuild, Properties 6-7: Meditation rendering correctness

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Pure functions extracted from meditation.html for testability
// ---------------------------------------------------------------------------

/**
 * Renders an array of meditation sessions as HTML card strings.
 * Mirrors the template in renderCards() from meditation.html.
 * @param {Array} sessions
 * @returns {string} HTML string
 */
function renderCardsHtml(sessions) {
  return sessions.map(s => `
    <div class="session-card" data-id="${s.id}">
      <span class="session-emoji">${s.emoji}</span>
      <div class="session-info">
        <div class="session-title">${s.title}</div>
        <div class="session-meta">${s.duration} min · ${s.category}</div>
      </div>
      <button class="btn btn-primary play-btn" data-id="${s.id}"
              aria-label="Play ${s.title}">▶ Play</button>
    </div>
  `).join('');
}

/**
 * Filters a session list by category.
 * Mirrors the filter logic in renderCards() from meditation.html.
 * @param {Array} sessions
 * @param {string} category - 'All' returns all sessions
 * @returns {Array}
 */
function filterSessions(sessions, category) {
  if (category === 'All') return sessions;
  return sessions.filter(s => s.category === category);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const categoryArb = fc.constantFrom('Morning', 'Focus', 'Sleep', 'Stress', 'Energy');

const meditationArb = fc.record({
  id:          fc.integer({ min: 1, max: 9999 }),
  title:       fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0),
  duration:    fc.integer({ min: 1, max: 60 }),
  category:    categoryArb,
  description: fc.string({ minLength: 0, maxLength: 200 }),
  emoji:       fc.constantFrom('🌅', '🧘', '😴', '🌿', '⚡', '🌊', '🔥', '🌙'),
});

// ---------------------------------------------------------------------------
// Property 6: Meditation cards render all required fields
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------
describe('Property 6: Meditation cards render all required fields', () => {
  test(
    'For any array of meditation objects, each rendered card contains title, duration, category, emoji, and a play button',
    () => {
      fc.assert(
        fc.property(
          fc.array(meditationArb, { minLength: 0, maxLength: 20 }),
          (sessions) => {
            const html = renderCardsHtml(sessions);

            for (const session of sessions) {
              // Title appears in the card
              if (!html.includes(session.title)) return false;

              // Duration appears as "<n> min"
              if (!html.includes(`${session.duration} min`)) return false;

              // Category appears in the card
              if (!html.includes(session.category)) return false;

              // Emoji appears in the card
              if (!html.includes(session.emoji)) return false;

              // Play button present (aria-label references the title)
              if (!html.includes(`aria-label="Play ${session.title}"`)) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test('empty session array renders no cards', () => {
    const html = renderCardsHtml([]);
    expect(html.trim()).toBe('');
  });

  test('single session card contains all required fields', () => {
    const session = {
      id: 1,
      title: 'Morning Calm',
      duration: 10,
      category: 'Morning',
      description: 'A gentle start',
      emoji: '🌅',
    };
    const html = renderCardsHtml([session]);
    expect(html).toContain('Morning Calm');
    expect(html).toContain('10 min');
    expect(html).toContain('Morning');
    expect(html).toContain('🌅');
    expect(html).toContain('aria-label="Play Morning Calm"');
    expect(html).toContain('▶ Play');
  });
});

// ---------------------------------------------------------------------------
// Property 7: Category filter shows only matching cards
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------
describe('Property 7: Category filter shows only matching cards', () => {
  test(
    'For any list of meditations and any selected category, filtered results contain only matching categories',
    () => {
      fc.assert(
        fc.property(
          fc.array(meditationArb, { minLength: 0, maxLength: 30 }),
          categoryArb,
          (sessions, category) => {
            const filtered = filterSessions(sessions, category);

            // Every returned session must match the selected category
            return filtered.every(s => s.category === category);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'For any list of meditations, filtering by "All" returns all sessions',
    () => {
      fc.assert(
        fc.property(
          fc.array(meditationArb, { minLength: 0, maxLength: 30 }),
          (sessions) => {
            const filtered = filterSessions(sessions, 'All');
            return filtered.length === sessions.length;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'No sessions from a different category appear in filtered results',
    () => {
      fc.assert(
        fc.property(
          fc.array(meditationArb, { minLength: 1, maxLength: 30 }),
          categoryArb,
          (sessions, category) => {
            const filtered = filterSessions(sessions, category);
            // None of the filtered sessions should have a different category
            return !filtered.some(s => s.category !== category);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test('filtering by a category with no matches returns empty array', () => {
    const sessions = [
      { id: 1, title: 'A', duration: 5, category: 'Morning', description: '', emoji: '🌅' },
      { id: 2, title: 'B', duration: 10, category: 'Morning', description: '', emoji: '🌅' },
    ];
    expect(filterSessions(sessions, 'Sleep')).toHaveLength(0);
  });

  test('filtering by a specific category returns only matching sessions', () => {
    const sessions = [
      { id: 1, title: 'A', duration: 5,  category: 'Morning', description: '', emoji: '🌅' },
      { id: 2, title: 'B', duration: 10, category: 'Focus',   description: '', emoji: '🧘' },
      { id: 3, title: 'C', duration: 15, category: 'Morning', description: '', emoji: '🌅' },
    ];
    const result = filterSessions(sessions, 'Morning');
    expect(result).toHaveLength(2);
    expect(result.every(s => s.category === 'Morning')).toBe(true);
  });
});
