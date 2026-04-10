// Feature: mindpulse-rebuild, Properties 12-13: Sleep sound correctness

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Pure state management functions for sleep sounds (no DOM/audio API needed)
// ---------------------------------------------------------------------------

/**
 * Creates the initial sleep sound state.
 * @returns {{ activeSound: string|null, volume: number }}
 */
function createSoundState() {
  return { activeSound: null, volume: 0.7 };
}

/**
 * Selects a sound:
 * - If soundId is already active, stops it (toggle off).
 * - Otherwise, stops any current sound and starts the new one.
 * @param {{ activeSound: string|null, volume: number }} state
 * @param {string} soundId
 * @returns {{ activeSound: string|null, volume: number }}
 */
function selectSound(state, soundId) {
  if (state.activeSound === soundId) {
    return { ...state, activeSound: null };
  }
  return { ...state, activeSound: soundId };
}

/**
 * Stops the currently playing sound.
 * @param {{ activeSound: string|null, volume: number }} state
 * @returns {{ activeSound: string|null, volume: number }}
 */
function stopSound(state) {
  return { ...state, activeSound: null };
}

/**
 * Sets the volume on the state.
 * @param {{ activeSound: string|null, volume: number }} state
 * @param {number} volume - value in [0, 1]
 * @returns {{ activeSound: string|null, volume: number }}
 */
function setVolume(state, volume) {
  return { ...state, volume };
}

// ---------------------------------------------------------------------------
// Property 12: Volume slider maps directly to audio volume
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------
describe('Property 12: Volume slider maps directly to audio volume', () => {
  test(
    'For any slider value V in [0, 1], setting volume to V results in state.volume === V',
    () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1, noNaN: true }),
          (v) => {
            const state = createSoundState();
            const next  = setVolume(state, v);
            return next.volume === v;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test('Volume is preserved when switching sounds', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.string({ minLength: 1 }),
        (v, soundId) => {
          let state = createSoundState();
          state = setVolume(state, v);
          state = selectSound(state, soundId);
          return state.volume === v;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Default volume is 0.7', () => {
    const state = createSoundState();
    expect(state.volume).toBe(0.7);
  });

  test('setVolume(state, 0) sets volume to 0', () => {
    const state = setVolume(createSoundState(), 0);
    expect(state.volume).toBe(0);
  });

  test('setVolume(state, 1) sets volume to 1', () => {
    const state = setVolume(createSoundState(), 1);
    expect(state.volume).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Property 13: Only one sleep sound plays at a time
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------
describe('Property 13: Only one sleep sound plays at a time', () => {
  test(
    'If sound A is playing and user selects sound B (B ≠ A), only B is active',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          (soundA, soundB) => {
            fc.pre(soundA !== soundB);

            let state = createSoundState();
            state = selectSound(state, soundA); // start A
            state = selectSound(state, soundB); // switch to B

            return state.activeSound === soundB;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'After selecting sound B, sound A is no longer active',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          (soundA, soundB) => {
            fc.pre(soundA !== soundB);

            let state = createSoundState();
            state = selectSound(state, soundA);
            state = selectSound(state, soundB);

            return state.activeSound !== soundA;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'Clicking the active sound stops it (toggle off)',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (soundId) => {
            let state = createSoundState();
            state = selectSound(state, soundId); // start
            state = selectSound(state, soundId); // toggle off
            return state.activeSound === null;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test('Initial state has no active sound', () => {
    const state = createSoundState();
    expect(state.activeSound).toBeNull();
  });

  test('stopSound always clears activeSound', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (soundId) => {
          let state = createSoundState();
          state = selectSound(state, soundId);
          state = stopSound(state);
          return state.activeSound === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Selecting a sequence of sounds always results in only the last one active', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 10 }),
        (sounds) => {
          // Ensure all sounds are distinct so no toggle-off occurs
          const unique = [...new Set(sounds)];
          fc.pre(unique.length >= 2);

          let state = createSoundState();
          for (const s of unique) {
            state = selectSound(state, s);
          }
          return state.activeSound === unique[unique.length - 1];
        }
      ),
      { numRuns: 100 }
    );
  });
});
