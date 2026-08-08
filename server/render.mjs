export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const linesToHtml = (content) => String(content || '').split(/\r?\n/).map((line) => {
  const text = line.trim();
  if (!text) return '<div class="spacer"></div>';
  if (/^[A-Z][A-Z &/+.-]{2,}$/.test(text) || /^#{1,3}\s/.test(text)) return `<h2>${escapeHtml(text.replace(/^#{1,3}\s*/, ''))}</h2>`;
  if (/^[-*•]\s+/.test(text)) return `<div class="bullet">• <span>${escapeHtml(text.replace(/^[-*•]\s+/, ''))}</span></div>`;
  return `<p>${escapeHtml(text)}</p>`;
}).join('');

const theme = (templateId) => ({
  'clean-ats': { accent: '#1d4ed8', font: 'Arial, sans-serif' },
  impact: { accent: '#0f766e', font: 'Georgia, serif' },
  'career-switch': { accent: '#7c3aed', font: 'Arial, sans-serif' }
}[templateId] || { accent: '#1d4ed8', font: 'Arial, sans-serif' });

function documentShell({ title, body, templateId = 'clean-ats' }) {
  const colors = theme(templateId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{font-family:${colors.font};color:#172033}*{box-sizing:border-box}body{margin:0;background:#e8ecf2}.toolbar{position:sticky;top:0;background:#172033;color:white;padding:12px 20px;text-align:center;font:14px Arial,sans-serif}.page{width:8.5in;min-height:11in;margin:24px auto;background:white;padding:.65in .7in;box-shadow:0 12px 40px #0f172a25;border-top:8px solid ${colors.accent}}h1{font-size:28px;margin:0 0 6px;color:${colors.accent}}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:${colors.accent};border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin:20px 0 8px}p{font-size:11.5pt;line-height:1.45;margin:5px 0;white-space:pre-wrap}.bullet{display:grid;grid-template-columns:14px 1fr;font-size:11.5pt;line-height:1.42;margin:4px 0}.spacer{height:6px}.meta{color:#475569;margin-bottom:18px}.letter{white-space:pre-wrap;font-size:11.5pt;line-height:1.6}@page{size:letter;margin:0}@media print{body{background:white}.toolbar{display:none}.page{width:auto;min-height:auto;margin:0;box-shadow:none}}
  </style></head><body><div class="toolbar">Use your browser’s Print command and choose “Save as PDF”.</div><main class="page">${body}</main></body></html>`;
}

export function renderResumeDocument(resume, profile) {
  const heading = `<h1>${escapeHtml(profile.name || resume.name)}</h1><p class="meta">${escapeHtml(profile.headline || '')}${profile.location ? ` · ${escapeHtml(profile.location)}` : ''}</p>`;
  return documentShell({ title: resume.name, templateId: resume.templateId, body: heading + linesToHtml(resume.content) });
}

export function renderCoverLetterDocument(letter, profile, job) {
  const heading = `<h1>${escapeHtml(profile.name || 'Cover letter')}</h1><p class="meta">${escapeHtml(job?.title || letter.title)}${job?.company ? ` · ${escapeHtml(job.company)}` : ''}</p>`;
  return documentShell({ title: letter.title, body: heading + `<div class="letter">${escapeHtml(letter.body)}</div>` });
}
