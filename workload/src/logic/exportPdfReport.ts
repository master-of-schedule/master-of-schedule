/**
 * Renders the official "Нагрузка учителей" report as a printable HTML page
 * and opens it in a new browser window for printing/saving as PDF.
 */

import type { OfficialReport } from './officialReport';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Formats the Variant header line, e.g. "Вариант_ 18 августа — первый" */
function formatVariant(date: string, label: string): string {
  if (!date) return label ? `Вариант_ ${label}` : '';
  const d = new Date(date);
  const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return label ? `Вариант_ ${formatted} — ${label}` : `Вариант_ ${formatted}`;
}

export function buildOfficialReportHtml(report: OfficialReport): string {
  const rows: string[] = [];

  for (const group of report.subjectGroups) {
    if (group.teachers.length === 0) continue;
    const rs = group.teachers.length;

    // Build the yellow subject cell content
    const subjLines: string[] = [
      `<strong><u>${esc(group.displayName)}</u></strong>`,
      `Всего: ${group.totalHours} ч.`,
      `Из них:`,
      `&nbsp;&nbsp;5–9 кл. — ${group.hours5to9} ч.`,
      `&nbsp;&nbsp;10–11 кл. — ${group.hours10to11} ч.`,
    ];

    if (group.isCompound && group.subjectBreakdown.length > 0) {
      for (const bd of group.subjectBreakdown) {
        subjLines.push(
          `&nbsp;&nbsp;${esc(bd.name)} — ${bd.total} ч.&nbsp;(5–9: ${bd.hours5to9}; 10–11: ${bd.hours10to11})`,
        );
      }
    }

    const subjCellContent = subjLines.join('<br>');

    group.teachers.forEach((t, i) => {
      const subjectCell =
        i === 0
          ? `<td class="subj" rowspan="${rs}">${subjCellContent}</td>`
          : '';
      rows.push(`
        <tr>
          ${subjectCell}
          <td>${esc(t.teacherName)}</td>
          <td class="c">${esc(t.homeroomClass ?? '')}</td>
          <td>${esc(t.cells5to9)}</td>
          <td>${esc(t.cells10to11)}</td>
          <td class="c">${t.totalHours}</td>
        </tr>`);
    });

    rows.push('<tr class="gap"><td colspan="6"></td></tr>');
  }

  // Electives section
  let electivesHtml = '';
  if (report.electives.length > 0) {
    const eRows: string[] = [];
    for (const course of report.electives) {
      eRows.push(`<tr class="elective-header">
        <td colspan="6"><strong>${esc(course.name)}</strong> — ${course.totalHours} ч.</td>
      </tr>`);
      for (const row of course.rows) {
        eRows.push(`<tr>
          <td colspan="2" class="elective-class">&nbsp;&nbsp;&nbsp;${esc(row.className)} (${row.hours} ч.)</td>
          <td colspan="4">${esc(row.teacherName)}</td>
        </tr>`);
      }
    }
    electivesHtml = `
      <h3 class="elective-title">Элективные курсы 10–11 классы</h3>
      <table>
        <tbody>${eRows.join('')}</tbody>
      </table>`;
  }

  // Summary section
  const s = report.summary;
  const summaryHtml = `
    <table class="summary-table">
      <tbody>
        <tr class="sum-header"><td colspan="2"><strong>Всего на учебные предметы:</strong></td></tr>
        <tr><td>1. По учебным планам 5–9 кл. в обязательной части (без деления на группы)</td>
            <td class="sum-val">${s.mandatory59NoSplit} ч.</td></tr>
        <tr><td>2. + при делении на группы</td>
            <td class="sum-val">${s.mandatory59Split} ч.</td></tr>
        ${s.optional59 > 0 ? `<tr><td>3. В части, формируемой участниками (5–9 кл.)</td>
            <td class="sum-val">${s.optional59} ч.</td></tr>` : ''}
        <tr class="sum-total"><td>Общее количество часов в основном корпусе по ООО</td>
            <td class="sum-val"><strong>${s.total59} ч.</strong></td></tr>
        <tr><td colspan="2">&nbsp;</td></tr>
        <tr><td>4. По учебным планам 10–11 кл. (без деления на группы)</td>
            <td class="sum-val">${s.mandatory1011NoSplit} ч.</td></tr>
        <tr><td>5. + при делении на группы</td>
            <td class="sum-val">${s.mandatory1011Split} ч.</td></tr>
        ${s.optional1011 > 0 ? `<tr><td>6. Элективные курсы (10–11 кл.)</td>
            <td class="sum-val">${s.optional1011} ч.</td></tr>` : ''}
        <tr class="sum-total"><td>Общее количество часов по СОО</td>
            <td class="sum-val"><strong>${s.total1011} ч.</strong></td></tr>
        <tr><td colspan="2">&nbsp;</td></tr>
        <tr class="sum-grand"><td><strong>Общее количество часов в 5–11 классах</strong></td>
            <td class="sum-val"><strong>${s.grandTotal} ч.</strong></td></tr>
      </tbody>
    </table>`;

  const variantLine = formatVariant(report.variantDate, report.variantLabel);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Нагрузка учителей ${report.schoolYear}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 16px; }
  h2 { text-align: center; margin: 0; font-size: 13px; }
  .subtitle { text-align: center; font-size: 11px; margin: 2px 0 8px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th { background: #d0d0d0; padding: 4px 6px; border: 1px solid #555;
       text-align: center; font-size: 10px; }
  td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; font-size: 10px; }
  .subj { background: #ffff00; min-width: 130px; max-width: 170px; line-height: 1.5; }
  .c { text-align: center; }
  .gap td { border: none; height: 3px; background: #fff; padding: 0; }
  .elective-title { font-size: 12px; margin: 16px 0 4px; }
  .elective-header td { background: #f0f0f0; font-weight: bold; }
  .elective-class { padding-left: 16px; }
  .summary-table { margin-top: 16px; }
  .summary-table td { border: 1px solid #ccc; padding: 3px 6px; }
  .sum-header td { background: #ffff00; font-size: 11px; }
  .sum-total td { background: #ffff88; }
  .sum-grand td { background: #ffff00; font-size: 11px; }
  .sum-val { text-align: right; white-space: nowrap; width: 80px; }
  .btn { padding: 7px 20px; font-size: 13px; cursor: pointer; margin: 0 6px; }
  .actions { margin-top: 16px; text-align: center; }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .actions { display: none; }
  }
</style>
</head>
<body>
<h2>Нагрузка учителей основной общей и средней общей школы</h2>
${report.schoolYear ? `<p class="subtitle">на ${report.schoolYear} учебный год</p>` : ''}
${variantLine ? `<p class="subtitle">${esc(variantLine)}</p>` : ''}
<table>
  <thead>
    <tr>
      <th rowspan="2" style="width:160px">Предмет<br>Общее к-во часов</th>
      <th rowspan="2">Учитель</th>
      <th rowspan="2" style="width:52px">Кл.<br>рук.</th>
      <th colspan="2">Классы, кол-во часов</th>
      <th rowspan="2" style="width:45px">Часов</th>
    </tr>
    <tr>
      <th style="width:160px">5–9</th>
      <th style="width:140px">10–11</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('')}
  </tbody>
</table>
${electivesHtml}
${summaryHtml}
<div class="actions">
  <button class="btn" onclick="window.print()">Печать / Сохранить PDF</button>
  <button class="btn" onclick="window.close()" style="margin-left:8px">Закрыть</button>
</div>
</body>
</html>`;
}

export function printOfficialReport(report: OfficialReport): void {
  const html = buildOfficialReportHtml(report);
  const w = window.open('', '_blank');
  if (!w) {
    alert('Не удалось открыть окно печати. Разрешите всплывающие окна для этой страницы.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
