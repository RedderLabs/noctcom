export type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'office' | 'unknown';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html',
  'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'sql',
  'env', 'gitignore', 'dockerfile', 'makefile', 'csv', 'log', 'svg',
]);

const EDITABLE_EXTENSIONS = new Set(['txt', 'md']);

const OFFICE_EXTENSIONS = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt']);

export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function classifyFile(mimeType?: string, fileName?: string): PreviewType {
  const ext = fileName ? getFileExtension(fileName) : '';
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mimeType?.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  if (OFFICE_EXTENSIONS.has(ext)) return 'office';
  return 'unknown';
}

export function isEditable(fileName: string): boolean {
  return EDITABLE_EXTENSIONS.has(getFileExtension(fileName));
}

export function getLanguageLabel(name: string): string {
  const ext = getFileExtension(name);
  const map: Record<string, string> = {
    js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX',
    json: 'JSON', css: 'CSS', html: 'HTML', xml: 'XML',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
    c: 'C', cpp: 'C++', sql: 'SQL', sh: 'Shell', yaml: 'YAML',
    yml: 'YAML', toml: 'TOML', md: 'Markdown', txt: 'Texto',
    csv: 'CSV', svg: 'SVG', ini: 'INI', log: 'Log',
  };
  return map[ext] || ext.toUpperCase() || 'Archivo';
}

export const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
export const MAX_TEXT_PREVIEW_SIZE = 5 * 1024 * 1024;
