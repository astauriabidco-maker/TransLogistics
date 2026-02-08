/**
 * Analytics Export Service
 *
 * Converts analytics data to CSV and PDF formats for download.
 * No external dependencies for CSV; uses pdfkit for PDF if available,
 * otherwise falls back to a text-based format.
 */

import { Response } from 'express';

// ──────────────────────────────────────────────────
// CSV Export
// ──────────────────────────────────────────────────

function escapeCSV(value: unknown): string {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function exportCSV(
    res: Response,
    filename: string,
    headers: string[],
    rows: Record<string, unknown>[],
): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

    // BOM for Excel compatibility
    res.write('\uFEFF');
    res.write(headers.join(',') + '\n');

    for (const row of rows) {
        const values = headers.map(h => escapeCSV(row[h]));
        res.write(values.join(',') + '\n');
    }

    res.end();
}

// ──────────────────────────────────────────────────
// PDF Export (text-based, no external dependency)
// ──────────────────────────────────────────────────

export function exportPDF(
    res: Response,
    filename: string,
    title: string,
    headers: string[],
    rows: Record<string, unknown>[],
): void {
    // Generate a clean text-based PDF-like report
    // For a real PDF, pdfkit would be used. This generates a downloadable text report
    // that can be converted to PDF by the browser's print function.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.html"`);

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @media print { body { margin: 0; } }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 2rem; color: #1a1a2e; }
        h1 { color: #16213e; border-bottom: 3px solid #0f3460; padding-bottom: 0.5rem; }
        .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem; }
        th { background: #0f3460; color: white; padding: 10px 12px; text-align: left; }
        td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) { background: #f8f9fa; }
        tr:hover { background: #e8eef4; }
        .footer { margin-top: 2rem; font-size: 0.8rem; color: #999; text-align: center; }
    </style>
</head>
<body>
    <h1>📊 ${title}</h1>
    <div class="meta">Généré le ${timestamp} — TransLogistics Analytics</div>
    <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>`;

    for (const row of rows) {
        html += '<tr>';
        for (const h of headers) {
            html += `<td>${String(row[h] ?? '—')}</td>`;
        }
        html += '</tr>';
    }

    html += `</tbody></table>
    <div class="footer">TransLogistics — Rapport confidentiel</div>
    <script>window.onload = () => window.print();</script>
</body></html>`;

    res.send(html);
}
