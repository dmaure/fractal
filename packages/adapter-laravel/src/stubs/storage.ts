/**
 * Generadores de estructura storage/ y sus .gitignore para Laravel.
 */

/**
 * Genera el .gitignore de storage/app/.
 */
export function generateStorageAppGitignore(): string {
  return `*
!public/
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/app/public/.
 */
export function generateStorageAppPublicGitignore(): string {
  return `*
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/framework/.
 */
export function generateStorageFrameworkGitignore(): string {
  return `compiled.php
config.php
down
events.scanned.php
maintenance.php
routes.php
routes.scanned.php
schedule-*
services.json
`;
}

/**
 * Genera el .gitignore de storage/framework/cache/.
 */
export function generateStorageFrameworkCacheGitignore(): string {
  return `*
!data/
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/framework/cache/data/.
 */
export function generateStorageFrameworkCacheDataGitignore(): string {
  return `*
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/framework/sessions/.
 */
export function generateStorageFrameworkSessionsGitignore(): string {
  return `*
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/framework/testing/.
 */
export function generateStorageFrameworkTestingGitignore(): string {
  return `*
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/framework/views/.
 */
export function generateStorageFrameworkViewsGitignore(): string {
  return `*
!.gitignore
`;
}

/**
 * Genera el .gitignore de storage/logs/.
 */
export function generateStorageLogsGitignore(): string {
  return `*
!.gitignore
`;
}
