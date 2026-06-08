// Renderizador de Markdown mínimo y sin dependencias (suficiente para nuestros
// docs: manual de usuario y guía de instalación). Compartido por las páginas
// que sirven un .md desde /public.

// Genera un id estable a partir del texto de un título (índice y anclas #):
// minúsculas, sin acentos, no-alfanuméricos → guion.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function renderMarkdown(md: string): string {
  let html = md;

  html = html.replace(/^### (.+)$/gm, (_, t) => `<h3 id="${slugify(t)}">${t}</h3>`);
  html = html.replace(/^## (.+)$/gm, (_, t) => `<h2 id="${slugify(t)}">${t}</h2>`);
  html = html.replace(/^# (.+)$/gm, (_, t) => `<h1 id="${slugify(t)}">${t}</h1>`);

  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    return `<pre><code class="lang-${lang || 'text'}">${escaped}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
    href.startsWith('#')
      ? `<a href="${href}" class="toc-link">${text}</a>`
      : `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  );

  html = html.replace(/^\| (.+) \|$/gm, (line) => {
    const cells = line.split('|').filter(Boolean).map((c) => c.trim());
    return '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (block) => {
    const rows = block.trim().split('\n');
    if (rows.length < 2) return block;
    const headerRow = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
    const sepIdx = rows.findIndex((r) => /^<tr>(<td>-+<\/td>)+<\/tr>$/.test(r));
    const bodyRows = rows.filter((_, i) => i !== 0 && i !== sepIdx).join('\n');
    return `<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
  });

  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ol">$2</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li class="ol">.*<\/li>\n?)+)/g, '<ol>$1</ol>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, (match) => {
    if (match.includes('<ol>')) return match;
    return `<ul>${match}</ul>`;
  });
  html = html.replace(/ class="ol"/g, '');

  html = html.replace(/^---$/gm, '<hr />');

  html = html.replace(/^(?!<[hupobltdira]|$)(.+)$/gm, '<p>$1</p>');

  html = html.replace(/<p><\/p>/g, '');

  return html;
}
