// Entidades
export * from './entities/library-item';
export * from './entities/game-discovery';
export * from './entities/plan';
export * from './entities/review';
export * from './entities/space';
export * from './entities/memory';
export * from './entities/cover-search';
export * from './entities/local-settings';
export * from './entities/saved-music';
export * from './entities/password-vault';
export * from './entities/data-management';
export * from './entities/category-utils';

// Interfaces de repositorio
export * from './repositories/library-repository';
export * from './repositories/plan-repository';
export * from './repositories/review-repository';
export * from './repositories/space-repository';
export * from './repositories/attachment-repository';
export * from './repositories/cover-search-service';
export * from './repositories/settings-repository';
export * from './repositories/activity-repository';
export * from './repositories/music-repository';
export * from './repositories/music-library-repository';
export * from './repositories/password-vault-repository';

// Persistencia local (por defecto — ver docs/DECISIONS.md punto 10)
export * from './local/local-store';
export * from './local/purge-state';
export * from './local/local-media';
export * from './repositories/local/local-settings-repository';
export * from './repositories/local/local-library-repository';
export * from './repositories/local/local-plan-repository';
export * from './repositories/local/local-review-repository';
export * from './repositories/local/local-space-repository';
export * from './repositories/local/local-attachment-repository';
export * from './repositories/local/local-activity-repository';
export * from './repositories/local/local-music-library-repository';
