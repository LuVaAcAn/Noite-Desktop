import { describe, expect, it } from 'vitest';
import type { GameScanCandidate } from '@proyecto-noche/domain';
import { groupCandidates, normalizedTitle } from './game-discovery-grouping';

function candidate(overrides: Partial<GameScanCandidate>): GameScanCandidate {
  return {
    installationId: 'installation-1',
    discoveryKey: 'steam:1',
    store: 'steam',
    storeGameId: '1',
    title: 'Night Game',
    installLocation: null,
    launchable: true,
    available: true,
    ignored: false,
    linkedLibraryItemId: null,
    ...overrides,
  };
}

describe('installed game review grouping', () => {
  it('normalizes trademark symbols and punctuation', () => {
    expect(normalizedTitle('Night™ Game: Deluxe')).toBe('night game deluxe');
  });

  it('suggests a multi-store group but excludes unavailable installations', () => {
    const groups = groupCandidates([
      candidate({ installationId: 'steam', store: 'steam', title: 'Night Game™' }),
      candidate({ installationId: 'gog', discoveryKey: 'gog:1', store: 'gog', title: 'Night Game' }),
      candidate({ installationId: 'missing', store: 'epic', available: false }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.candidates.map((item) => item.installationId)).toEqual(['steam', 'gog']);
  });
});
