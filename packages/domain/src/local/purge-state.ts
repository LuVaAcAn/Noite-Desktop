import type { PurgeCounts, PurgePreview } from '../entities/data-management';
import type { LocalState } from './local-store';

export interface PurgedState {
  state: LocalState;
  preview: PurgePreview;
  candidateMediaPaths: string[];
}

function emptyCounts(): PurgeCounts {
  return { libraryItems: 0, plans: 0, planItems: 0, reviews: 0, sharedReviews: 0, attachments: 0, musicAssociations: 0, sessions: 0 };
}

export function referencedMediaPaths(state: LocalState): Set<string> {
  const paths = new Set<string>();
  const add = (value: unknown) => { if (typeof value === 'string' && value.startsWith('media/')) paths.add(value); };
  state.libraryItems.forEach((item) => add(item.customCoverPath));
  state.attachments.forEach((item) => add(item.storagePath));
  state.memoryTracks.forEach((item) => add(item.cachedArtworkPath));
  state.savedMusicItems.forEach((item) => { add(item.localStoragePath); add(item.artworkStoragePath); });
  add(state.settings.userAvatarPath);
  add(state.settings.partnerAvatarPath);
  Object.values(state.settings.sectionAppearances).forEach((appearance) => add(appearance.backgroundImageStoragePath ?? appearance.backgroundImagePath));
  return paths;
}

export function purgeArchivedActivityFromState(state: LocalState, itemId: string): PurgedState {
  const target = state.libraryItems.find((item) => item.id === itemId);
  if (!target) throw new Error('Actividad no encontrada.');
  if (!target.archivedAt) throw new Error('Solo se pueden eliminar definitivamente actividades archivadas.');

  const planItemIds = new Set<string>();
  const affectedPlanIds = new Set<string>();
  for (const plan of state.plans) {
    for (const item of plan.items) {
      if (item.libraryItemId === itemId) {
        planItemIds.add(item.id);
        affectedPlanIds.add(plan.id);
      }
    }
  }
  const plans = state.plans.map((plan) => ({ ...plan, items: plan.items.filter((item) => !planItemIds.has(item.id)) })).filter((plan) => plan.items.length > 0);
  const survivingPlanIds = new Set(plans.map((plan) => plan.id));
  const removedPlanIds = new Set([...affectedPlanIds].filter((id) => !survivingPlanIds.has(id)));
  const removedAttachments = state.attachments.filter((item) => item.planItemId && planItemIds.has(item.planItemId));
  const removedTracks = state.memoryTracks.filter((item) => planItemIds.has(item.planItemId));
  const candidateMediaPaths = [target.customCoverPath, ...removedAttachments.map((item) => item.storagePath), ...removedTracks.map((item) => item.cachedArtworkPath)]
    .filter((path): path is string => Boolean(path));

  const next: LocalState = {
    ...state,
    libraryItems: state.libraryItems.filter((item) => item.id !== itemId),
    plans,
    reviews: state.reviews.filter((review) => !planItemIds.has(review.planItemId)),
    sharedReviews: state.sharedReviews.filter((review) => !planItemIds.has(review.planItemId)),
    memoryTracks: state.memoryTracks.filter((track) => !planItemIds.has(track.planItemId)),
    attachments: state.attachments.filter((attachment) => !attachment.planItemId || !planItemIds.has(attachment.planItemId)),
    sessions: state.sessions.filter((session) => !session.planId || !removedPlanIds.has(session.planId)).map((session) => planItemIds.has(session.currentPlanItemId ?? '') ? { ...session, currentPlanItemId: null } : session),
  };
  const counts: PurgeCounts = {
    ...emptyCounts(),
    libraryItems: 1,
    plans: removedPlanIds.size,
    planItems: planItemIds.size,
    reviews: state.reviews.filter((review) => planItemIds.has(review.planItemId)).length,
    sharedReviews: state.sharedReviews.filter((review) => planItemIds.has(review.planItemId)).length,
    attachments: removedAttachments.length,
    musicAssociations: removedTracks.length,
    sessions: state.sessions.filter((session) => (session.planId && removedPlanIds.has(session.planId)) || planItemIds.has(session.currentPlanItemId ?? '')).length,
  };
  const referenced = referencedMediaPaths(next);
  return {
    state: next,
    candidateMediaPaths: [...new Set(candidateMediaPaths)].filter((path) => !referenced.has(path)),
    preview: { targetId: itemId, targetTitle: target.title, counts, mediaBytes: 0, mediaFiles: 0, clearsRollingBackups: true },
  };
}
