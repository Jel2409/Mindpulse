// Feature: mindpulse-rebuild, Properties 9-10: Timer correctness

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Pure timer logic extracted from meditation.html for testing
// (no DOM or setInterval needed)
// ---------------------------------------------------------------------------

/**
 * Formats seconds as zero-padded MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/**
 * Creates a fresh timer state for the given duration (in seconds).
 * @param {number} duration
 * @returns {{ duration: number, remaining: number, running: boolean, intervalId: null }}
 */
function createTimerState(duration) {
  return { duration, remaining: duration, running: false, intervalId: null };
}

/**
 * Advances the timer by one second (pure — returns new state).
 * @param {{ duration: number, remaining: number, running: boolean, intervalId: null }} state
 * @returns {{ duration: number, remaining: number, running: boolean, intervalId: null }}
 */
function applyTick(state) {
  if (!state.running || state.remaining <= 0) return { ...state };
  return { ...state, remaining: Math.max(0, state.remaining - 1) };
}

/**
 * Pauses the timer (pure — returns new state).
 * @param {{ duration: number, remaining: number, running: boolean, intervalId: null }} state
 * @returns {{ duration: number, remaining: number, running: boolean, intervalId: null }}
 */
function applyPause(state) {
  return { ...state, running: false, intervalId: null };
}

/**
 * Resets the timer to its original duration (pure — returns new state).
 * @param {{ duration: number, remaining: number, running: boolean, intervalId: null }} state
 * @returns {{ duration: number, remaining: number, running: boolean, intervalId: null }}
 */
function applyReset(state) {
  return { ...state, remaining: state.duration, running: false, intervalId: null };
}

// ---------------------------------------------------------------------------
// Property 9: Timer formats remaining time as MM:SS
// Validates: Requirements 4.1
// ---------------------------------------------------------------------------
describe('Property 9: Timer formats remaining time as MM:SS', () => {
  test(
    'For any non-negative integer seconds (0–5999), formatTime returns a MM:SS string',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5999 }),
          (seconds) => {
            const result = formatTime(seconds);
            return /^\d{2}:\d{2}$/.test(result);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test('formatTime zero-pads both minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(90)).toBe('01:30');
    expect(formatTime(5999)).toBe('99:59');
  });
});

// ---------------------------------------------------------------------------
// Property 10: Timer state transitions preserve correctness
// Validates: Requirements 4.4, 4.5
// ---------------------------------------------------------------------------
describe('Property 10: Timer state transitions preserve correctness', () => {
  // (a) Pausing at any point preserves remaining time
  test(
    '(a) Pausing after N ticks preserves remaining time so resuming continues from that value',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3600 }),  // duration in seconds
          fc.integer({ min: 0, max: 3600 }),  // ticks before pause
          (duration, ticks) => {
            // Clamp ticks so we don't tick past zero
            const actualTicks = Math.min(ticks, duration);

            let state = createTimerState(duration);
            state = { ...state, running: true };

            for (let i = 0; i < actualTicks; i++) {
              state = applyTick(state);
            }

            const remainingBeforePause = state.remaining;
            state = applyPause(state);

            // After pause: running is false and remaining is unchanged
            return state.running === false && state.remaining === remainingBeforePause;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // (b) Resetting from any state restores remaining to original duration
  test(
    '(b) Resetting from any state restores remaining time to the original duration',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3600 }),  // duration in seconds
          fc.integer({ min: 0, max: 3600 }),  // ticks elapsed before reset
          fc.boolean(),                        // whether timer is running at reset
          (duration, ticks, running) => {
            const actualTicks = Math.min(ticks, duration);

            let state = createTimerState(duration);
            state = { ...state, running: true };

            for (let i = 0; i < actualTicks; i++) {
              state = applyTick(state);
            }

            // Optionally pause before reset
            if (!running) {
              state = applyPause(state);
            }

            state = applyReset(state);

            return state.remaining === duration && state.running === false;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
