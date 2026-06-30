/**
 * Google Apps Script para Mis Finanzas
 *
 * 1. Crea una Google Sheet nueva
 * 2. Extensiones → Apps Script → pega este código
 * 3. Implementar → Nueva implementación → Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 4. Copia la URL /exec en sheets-config.js
 */

const SHEET_NAME = 'Movimientos';

function doGet(e) {
  const action = e?.parameter?.action || 'get';

  if (action === 'get') {
    return jsonResponse_({ items: getMovements_() });
  }

  return jsonResponse_({ error: 'Acción no válida' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'save') {
      saveMovements_(body.items || []);
      return jsonResponse_({ ok: true });
    }

    return jsonResponse_({ error: 'Acción no válida' });
  } catch (error) {
    return jsonResponse_({ error: error.message });
  }
}

function getMovements_() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();

  if (rows.length <= 1) {
    return [];
  }

  const items = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    items.push({
      id: String(row[0]),
      type: String(row[1]),
      amount: Number(row[2]),
      note: String(row[3] || ''),
      date: String(row[4]),
    });
  }

  return items;
}

function saveMovements_(items) {
  const sheet = getSheet_();
  sheet.clearContents();
  sheet.appendRow(['id', 'type', 'amount', 'note', 'date']);

  items.forEach((item) => {
    sheet.appendRow([
      item.id,
      item.type,
      item.amount,
      item.note || '',
      item.date,
    ]);
  });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'type', 'amount', 'note', 'date']);
  }

  return sheet;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
