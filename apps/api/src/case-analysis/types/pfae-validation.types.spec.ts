// Structural tests for PFAE validation gate types (HU-19b).
// TDD — Phase 1: these tests pin the design contract so the rule, orchestrator,
// and future HU-21 UI share one snapshot shape. Interfaces are verified by
// constructing objects that satisfy them.
//
// Triangulation skipped: type-and-const definitions with no branching.

import {
  PFAE_GATE_OUTCOMES,
  type PfaeGateOutcome,
  type PfaeValidationSnapshot,
} from './pfae-validation.types';

describe('pfae-validation.types', () => {
  describe('PfaeGateOutcome', () => {
    it('exposes exactly the gate outcome literals from the design contract', () => {
      expect(PFAE_GATE_OUTCOMES).toEqual(['PASS', 'PARTIAL', 'FAIL', 'WARNING', 'INFO']);
    });

    it('accepts each catalog value as a valid PfaeGateOutcome member', () => {
      const probes: PfaeGateOutcome[] = ['PASS', 'PARTIAL', 'FAIL', 'WARNING', 'INFO'];
      expect(probes).toHaveLength(5);
      expect(probes[0]).toBe('PASS');
      expect(probes[4]).toBe('INFO');
    });
  });

  describe('PfaeValidationSnapshot', () => {
    it('accepts a fully populated snapshot matching the design contract', () => {
      const snapshot: PfaeValidationSnapshot = {
        regime: { isSolelySalaried: true, outcome: 'FAIL' },
        vigencia: {
          issuanceDate: '2025-01-15',
          isOlderThan3Months: true,
          outcome: 'WARNING',
        },
        tenure: { months: 12, activityStartDate: '2024-09-01' },
        activity: { satDescription: 'Comercio al por menor', percentage: 70 },
        coherence: { rentWithoutRegimeCount: 2, outcome: 'WARNING' },
      };

      expect(snapshot.regime.outcome).toBe('FAIL');
      expect(snapshot.vigencia?.outcome).toBe('WARNING');
      expect(snapshot.tenure?.months).toBe(12);
      expect(snapshot.activity?.satDescription).toBe('Comercio al por menor');
      expect(snapshot.coherence?.rentWithoutRegimeCount).toBe(2);
    });

    it('allows nullable vigencia, tenure, activity, and coherence sections', () => {
      const empty: PfaeValidationSnapshot = {
        regime: { isSolelySalaried: false, outcome: 'PASS' },
        vigencia: null,
        tenure: null,
        activity: null,
        coherence: null,
      };

      expect(empty.regime.outcome).toBe('PASS');
      expect(empty.vigencia).toBeNull();
      expect(empty.tenure).toBeNull();
      expect(empty.activity).toBeNull();
      expect(empty.coherence).toBeNull();
    });
  });
});
