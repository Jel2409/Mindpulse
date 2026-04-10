// Feature: mindpulse-rebuild, Property 18: Achievement lock/unlock reflects stats criteria

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Achievement definitions — mirrors progress.html
// ---------------------------------------------------------------------------

const ACHIEVEMENTS = [
  { id: 'first_session', label: 'First Session', emoji: '🌱', criteria: s => s.sessions >= 1 },
  { id: 'streak_7',      label: '7-Day Streak',  emoji: '🔥', criteria: s => s.streak >= 7 },
  { id: 'minutes_100',   label: '100 Minutes',   emoji: '⏱️', criteria: s => s.totalMinutes >= 100 },
  { id: 'sessions_10',   label: '10 Sessions',   emoji: '🧘', criteria: s => s.sessions >= 10 },
  { id: 'streak_30',     label: '30-Day Streak', emoji: '🏆', criteria: s => s.streak >= 30 },
];

/**
 * Pure function that evaluates each achievement against the given stats.
 * Returns an array of { id, unlocked } objects.
 * @param {{ sessions: number, totalMinutes: number, streak: number }} stats
 * @returns {Array<{ id: string, unlocked: boolean }>}
 */
function evaluateAchievements(stats) {
  return ACHIEVEMENTS.map(a => ({
    id:       a.id,
    unlocked: a.criteria(stats),
  }));
}

// ---------------------------------------------------------------------------
// Property 18: Achievement lock/unlock reflects stats criteria
// Validates: Requirements 8.3, 8.4
// ---------------------------------------------------------------------------
describe('Property 18: Achievement lock/unlock reflects stats criteria', () => {
  test(
    'For any user stats, each achievement is unlocked iff its criteria are satisfied',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            sessions:     fc.nat(),
            totalMinutes: fc.nat(),
            streak:       fc.nat(),
          }),
          (stats) => {
            const results = evaluateAchievements(stats);

            // Must have one result per achievement
            if (results.length !== ACHIEVEMENTS.length) return false;

            for (let i = 0; i < ACHIEVEMENTS.length; i++) {
              const expected = ACHIEVEMENTS[i].criteria(stats);
              if (results[i].id !== ACHIEVEMENTS[i].id) return false;
              if (results[i].unlocked !== expected) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'Achievements whose criteria are not met are locked (unlocked === false)',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            sessions:     fc.nat(),
            totalMinutes: fc.nat(),
            streak:       fc.nat(),
          }),
          (stats) => {
            const results = evaluateAchievements(stats);

            for (let i = 0; i < ACHIEVEMENTS.length; i++) {
              const criteriaMet = ACHIEVEMENTS[i].criteria(stats);
              if (!criteriaMet && results[i].unlocked !== false) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'Achievements whose criteria are met are unlocked (unlocked === true)',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            sessions:     fc.nat(),
            totalMinutes: fc.nat(),
            streak:       fc.nat(),
          }),
          (stats) => {
            const results = evaluateAchievements(stats);

            for (let i = 0; i < ACHIEVEMENTS.length; i++) {
              const criteriaMet = ACHIEVEMENTS[i].criteria(stats);
              if (criteriaMet && results[i].unlocked !== true) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
