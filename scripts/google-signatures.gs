/* Paste this file into Extensions > Apps Script in a private Google Sheet.
 * Run setupSignatories once, then deploy as a Web app: execute as Me, access Anyone.
 * Requests require the private shared secret; the spreadsheet itself stays private.
 */
const SIGNATURE_HEADERS = ['Name', 'Email', 'Role', 'Status', 'Priority', 'Submitted', 'Consent', 'Source', 'Submission ID', 'Notes', 'Institution / company'];

function setupSignatories() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  if (!properties.getProperty('SHARED_SECRET')) properties.setProperty('SHARED_SECRET', Utilities.getUuid() + Utilities.getUuid());
  let sheet = spreadsheet.getSheetByName('Signatories');
  if (!sheet) sheet = spreadsheet.insertSheet('Signatories');
  if (sheet.getLastRow() === 0) sheet.appendRow(SIGNATURE_HEADERS);
  // Upgrade the original ten-column sheet without moving any existing columns.
  const institutionHeader = sheet.getRange(1, 11, 1, 1).getValues()[0][0];
  if (institutionHeader === '') {
    const occupied = sheet.getRange(1, 11, sheet.getMaxRows(), 1).getValues().some(function (r) { return r[0] !== ''; });
    const formulas = sheet.getRange(1, 11, sheet.getMaxRows(), 1).getFormulas().some(function (r) { return r[0] !== ''; });
    if (occupied || formulas) throw new Error('Column K is in use. Move its contents before running setup.');
    sheet.getRange(1, 11, 1, 1).setValues([['Institution / company']]);
  }
  verifyHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SIGNATURE_HEADERS.length).setFontWeight('bold').setBackground('#eeeeee');
  sheet.getRange(2, 4, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Pending', 'Approved', 'Hidden', 'Rejected'], true).setAllowInvalid(false).build());
  sheet.getRange(2, 5, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());
  sheet.getRange(2, 7, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build());
  sheet.getRange('F:F').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.autoResizeColumns(1, SIGNATURE_HEADERS.length);
  spreadsheet.toast('Ready. Copy SHARED_SECRET from Apps Script > Project Settings > Script properties into Vercel.');
}

function verifyHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, SIGNATURE_HEADERS.length).getValues()[0];
  if (headers.some(function (value, i) { return value !== SIGNATURE_HEADERS[i]; })) throw new Error('Headers changed');
}
function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('Signatories');
  verifyHeaders_(sheet);
  return sheet;
}
function reply_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function validText_(value, max, required) {
  return typeof value === 'string' && (!required || value.trim().length > 0) && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function safeCell_(value) {
  // Neutralise formula prefixes, while keeping the displayed text unchanged.
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}
function publicSignatories_(rows) {
  return rows.filter(function (r) {
    return r[3] === 'Approved' && r[6] === true && validText_(r[0], 141, true) && validText_(r[2] || '', 100, false) && validText_(r[10] || '', 150, false);
  }).map(function (r, index) {
    return { name: r[0].trim(), role: String(r[2] || '').trim(), institution: String(r[10] || '').trim(), priority: typeof r[4] === 'number' && isFinite(r[4]) && r[4] >= 0 ? r[4] : Number.MAX_SAFE_INTEGER, index: index };
  }).sort(function (a, b) { return a.priority - b.priority || a.index - b.index; })
    .map(function (r) { const person = { name: r.name, role: r.role }; if (r.institution) person.institution = r.institution; return person; });
}
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || !body || body.secret !== secret) return reply_({ ok: false, code: 'UNAUTHORIZED' });
    if (body.action === 'list') {
      const sheet = sheet_();
      const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, SIGNATURE_HEADERS.length).getValues();
      return reply_({ ok: true, supportsInstitution: true, signatories: publicSignatories_(rows) });
    }
    if (body.action !== 'submit' || !validText_(body.name, 141, true) || !validText_(body.email, 254, true)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || !validText_(body.role || '', 100, false)
      || !validText_(body.institution || '', 150, false) || body.consent !== true || !/^[a-zA-Z0-9-]{16,80}$/.test(body.submissionId || '') || !/^[a-f0-9]{64}$/.test(body.clientKey || '')) {
      return reply_({ ok: false, code: 'INVALID' });
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return reply_({ ok: false, code: 'BUSY' });
    try {
      const sheet = sheet_();
      const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, SIGNATURE_HEADERS.length).getValues();
      const email = body.email.trim().toLowerCase();
      // Retries and repeat email addresses never modify an existing approval or name.
      if (rows.some(function (r) { return String(r[8]) === body.submissionId || String(r[1]).trim().toLowerCase() === email; })) return reply_({ ok: true });
      const cache = CacheService.getScriptCache();
      const key = 'submit:' + body.clientKey;
      const count = Number(cache.get(key) || 0);
      if (count >= 8) return reply_({ ok: false, code: 'RATE_LIMIT' });
      const row = [safeCell_(body.name.trim()), safeCell_(email), safeCell_(String(body.role || '').trim()), 'Pending', '', new Date(), true, 'Website', body.submissionId, '', safeCell_(String(body.institution || '').trim())];
      // Ignore unused unchecked consent boxes, but preserve any other content.
      const emptyIndex = rows.findIndex(function (r, index) {
        const empty = r.every(function (value, column) {
          return value === '' || (column === 6 && value === false);
        });
        return empty && sheet.getRange(index + 2, 1, 1, SIGNATURE_HEADERS.length)
          .getFormulas()[0].every(function (formula) { return formula === ''; });
      });
      const targetRow = emptyIndex === -1 ? rows.length + 2 : emptyIndex + 2;
      if (targetRow > sheet.getMaxRows()) {
        sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
      }
      sheet.getRange(targetRow, 1, 1, SIGNATURE_HEADERS.length).setValues([row]);
      SpreadsheetApp.flush();
      cache.put(key, String(count + 1), 600);
      return reply_({ ok: true });
    } finally { lock.releaseLock(); }
  } catch (_) { return reply_({ ok: false, code: 'UNAVAILABLE' }); }
}
