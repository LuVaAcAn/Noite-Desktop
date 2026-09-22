export interface PurgeCounts {
  libraryItems: number;
  plans: number;
  planItems: number;
  reviews: number;
  sharedReviews: number;
  attachments: number;
  musicAssociations: number;
  sessions: number;
}

export interface PurgePreview {
  targetId: string | null;
  targetTitle: string;
  counts: PurgeCounts;
  mediaBytes: number;
  mediaFiles: number;
  clearsRollingBackups: boolean;
}

export interface PurgeResult extends PurgePreview {
  completedAt: string;
}

export interface FactoryResetStatus {
  completed: boolean;
  removedMediaFiles: number;
  removedCredentials: boolean;
}

export interface ProviderRateLimitError {
  code: 'rate_limited';
  message: string;
  retryAfterSeconds: number;
}

export interface AppUpdateStatus {
  currentVersion: string;
  availableVersion: string | null;
  notes: string | null;
  publishedAt: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
  error: string | null;
}
