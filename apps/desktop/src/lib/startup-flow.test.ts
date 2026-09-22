import { describe, expect, it } from 'vitest';
import { resolveStartupDestination } from './startup-flow';
describe('startup navigation', () => {
  it('opens setup for a new installation', () => {
    expect(resolveStartupDestination({ onboardingStage: 'language', onboardingComplete: false })).toBe('language');
  });
  it('requires profile access after setup', () => {
    expect(resolveStartupDestination({ onboardingStage: 'complete', onboardingComplete: true })).toBe('local-access');
  });
  it('resumes unfinished setup', () => {
    expect(resolveStartupDestination({ onboardingStage: 'complete', onboardingComplete: false })).toBe('language');
  });
});
