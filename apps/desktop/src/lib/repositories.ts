import {
  LocalAttachmentRepository,
  LocalActivityRepository,
  LocalLibraryRepository,
  LocalPlanRepository,
  LocalReviewRepository,
  LocalSettingsRepository,
  LocalSpaceRepository,
  LocalMusicLibraryRepository,
  type AttachmentRepository,
  type ActivityRepository,
  type CoverSearchService,
  type LibraryRepository,
  type SpotifyLinkService,
  type PlanRepository,
  type ReviewRepository,
  type SettingsRepository,
  type SpaceRepository,
  type MusicLibraryRepository,
} from '@proyecto-noche/domain';
import { NativeSpotifyLinkService } from './native-music-repository';
import { NativeCoverSearchService } from './native-cover-search';

// Core data is always local. Cover lookup is the only optional managed service.
export const libraryRepository: LibraryRepository = new LocalLibraryRepository();
export const planRepository: PlanRepository = new LocalPlanRepository();
export const reviewRepository: ReviewRepository = new LocalReviewRepository();
export const spaceRepository: SpaceRepository = new LocalSpaceRepository();
export const attachmentRepository: AttachmentRepository = new LocalAttachmentRepository();
export const activityRepository: ActivityRepository = new LocalActivityRepository();
export const settingsRepository: SettingsRepository = new LocalSettingsRepository();
export const spotifyLinkService: SpotifyLinkService = new NativeSpotifyLinkService();
export const musicLibraryRepository: MusicLibraryRepository = new LocalMusicLibraryRepository();
export const coverSearchService: CoverSearchService = new NativeCoverSearchService();
