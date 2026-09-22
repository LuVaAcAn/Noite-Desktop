import type { OnboardingStage } from '@proyecto-noche/domain';

export type StartupDestination = 'title' | 'language' | 'local-access';

export function resolveStartupDestination(input: {
  onboardingStage: OnboardingStage;
  onboardingComplete: boolean;
}): StartupDestination {
  if (input.onboardingStage === 'language') return 'language';
  if (input.onboardingStage !== 'complete' || !input.onboardingComplete) return 'language';
  return 'local-access';
}
