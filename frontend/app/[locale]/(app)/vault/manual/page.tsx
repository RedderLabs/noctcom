'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { BookOpen } from 'lucide-react';

export default function ManualPage() {
  const t = useTranslations('manual');
  const locale = useLocale();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(locale === 'en' ? '/manual.en.md' : '/manual.md')
      .then((r) => r.text())
      .then((md) => {
        setHtml(renderMarkdown(md));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [locale]);

  if (loading) {
    return (
      <div className="px-8 py-12 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-bg-surface rounded w-64" />
          <div className="h-4 bg-bg-surface rounded w-full" />
          <div className="h-4 bg-bg-surface rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center">
          <BookOpen className="size-5 text-violet-300" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-text-muted font-mono uppercase tracking-wider">
            {t('subtitle')}
          </p>
        </div>
      </div>
      <article
        className="prose-noctcom"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// Genera un id estable a partir del texto de un título (para el índice y los
// enlaces internos #ancla): minúsculas, sin acentos, no-alfanuméricos → guion.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita los acentos ya separados por NFD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function renderMarkdown(md: string): string {
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
      ? `<a href="${href}" class="toc-link">${text}</a>` // enlace interno del índice
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
