import type { GameScanCandidate } from '@proyecto-noche/domain';

export interface CandidateGroup {
  key: string;
  title: string;
  candidates: GameScanCandidate[];
}

export function normalizedTitle(value: string) {
  return value
    .replace(/[\u2122\u00ae\u00a9]/g, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function groupCandidates(candidates: GameScanCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates.filter((value) => value.available)) {
    const key = normalizedTitle(candidate.title) || candidate.discoveryKey;
    const group = groups.get(key) ?? { key, title: candidate.title, candidates: [] };
    group.candidates.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}
