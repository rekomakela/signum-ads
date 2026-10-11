const WORDMARKS: Readonly<Record<string, string>> = {
  ikea: 'IKEA',
};

export function caseDisplayTitle(caseId: string, title?: string | null): string {
  const storedTitle = title
    ?.trim()
    .replace(/\s+[-–—|]\s*$/, '')
    .trim();
  if (storedTitle) return storedTitle;

  return caseId
    .replace(/^(real|seed|decoded)-/, '')
    .replace(/-[a-f0-9]{8}$/i, '')
    .split('-')
    .map((word) => WORDMARKS[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
