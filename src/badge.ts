import { ServerDiagnosisReport } from './types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateHealthBadgeSvg(report: ServerDiagnosisReport): string {
  const leftText = 'Agent Doctor';
  const rightText = `${report.score}/100 (${report.grade}) · ${report.totalTokens} tok/turn`;
  const color =
    report.score >= 88
      ? '#16a34a'
      : report.score >= 76
        ? '#0284c7'
        : report.score >= 62
          ? '#d97706'
          : '#dc2626';

  const leftWidth = 88;
  const rightWidth = Math.max(145, Math.round(rightText.length * 6.5) + 18);
  const totalWidth = leftWidth + rightWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(leftText)}: ${escapeXml(rightText)}">
  <title>${escapeXml(leftText)}: ${escapeXml(rightText)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#1e293b"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${Math.round(leftWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(leftText)}</text>
    <text x="${Math.round(leftWidth / 2)}" y="14" fill="#fff">${escapeXml(leftText)}</text>
    <text aria-hidden="true" x="${leftWidth + Math.round(rightWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(rightText)}</text>
    <text x="${leftWidth + Math.round(rightWidth / 2)}" y="14" fill="#fff" font-weight="bold">${escapeXml(rightText)}</text>
  </g>
</svg>`;
}
