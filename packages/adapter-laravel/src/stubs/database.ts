/**
 * Generadores de estructura database/ para Laravel.
 */

/**
 * Genera el .gitignore de database/.
 */
export function generateDatabaseGitignore(): string {
  return `*.sqlite
*.sqlite-journal
`;
}
