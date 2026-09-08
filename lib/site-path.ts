/** Public files need the repository prefix when hosted on GitHub Pages. */
export function sitePath(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ''}${path}`;
}
