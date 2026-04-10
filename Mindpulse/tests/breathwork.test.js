// Feature: mindpulse-rebuild, Property 11: Breathwork phases cycle in correct order

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Pure breathwork phase logic extracted for testing (no DOM needed)
// ---------------------------------------------------------------------------

const phases = [
  { label: 'Inhale', duration: 4000 },
  { label: 'Hold',   duration: 7000 },
  { label: 'Exhale', duration: 8000 }
];

/**
 * Returns the phase at a given advance count N (0-indexed from start).
 * @param {number} n - number of phase advances from the beginning
 * @returns {{ label: string, duration: number }}
 */
function getPhaseAt(n) {
  return phases[n % phases.length];
}

/**
 * Returns the sequence of phases for N advances.
 * @param {number} n
 * @returns {Array<{ label: string, duration: number }>}
 */
function getPhaseSequence(n) {
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(getPhaseAt(i));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Property 11: Breathwork phases cycle in correct order
// Validates: Requirements 5.2, 5.5
// ---------------------------------------------------------------------------
describe('Property 11: Breathwork phases cycle in correct order', () => {
  test(
    'For any number of phase advances N, the sequence follows Inhale → Hold → Exhale repeating',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 300 }),
          (n) => {
            const expectedOrder = ['Inhale', 'Hold', 'Exhale'];
            const sequence = getPhaseSequence(n);

            return sequence.every((phase, i) => {
              return phase.label === expectedOrder[i % 3];
            });
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'Each phase in the sequence has the correct 4-7-8 duration',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 300 }),
          (n) => {
            const expectedDurations = { Inhale: 4000, Hold: 7000, Exhale: 8000 };
            const sequence = getPhaseSequence(n);

            return sequence.every(phase => {
              return phase.duration === expectedDurations[phase.label];
            });
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test('Phase 0 is Inhale (4000ms), phase 1 is Hold (7000ms), phase 2 is Exhale (8000ms)', () => {
    expect(getPhaseAt(0)).toEqual({ label: 'Inhale', duration: 4000 });
    expect(getPhaseAt(1)).toEqual({ label: 'Hold',   duration: 7000 });
    expect(getPhaseAt(2)).toEqual({ label: 'Exhale', duration: 8000 });
  });

  test('Phases wrap correctly — index 3 is Inhale again, index 4 is Hold, index 5 is Exhale', () => {
    expect(getPhaseAt(3)).toEqual({ label: 'Inhale', duration: 4000 });
    expect(getPhaseAt(4)).toEqual({ label: 'Hold',   duration: 7000 });
    expect(getPhaseAt(5)).toEqual({ label: 'Exhale', duration: 8000 });
  });

  test('After any multiple of 3 advances, the next phase is always Inhale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (k) => {
          // k full cycles → next phase (index k*3) should be Inhale
          return getPhaseAt(k * 3).label === 'Inhale';
        }
      ),
      { numRuns: 100 }
    );
  });
});
