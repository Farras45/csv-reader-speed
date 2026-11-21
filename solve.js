// Fast CSV reader: a faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// run(input) returns exactly what csv-reader 1.0.0 returns for {text, header}:
// {columns, rows, errors}, following its written broken-row policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it
//     one quote, and each CRLF or lone CR inside it is read as LF; what follows its closing
//     quote, up to the next comma or line break, is appended as it stands (quote_junk, when
//     the field ends); a quote that never closes is a literal character, and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never
//     trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records
//     after it (every record when header is false), each padded with "" (short_row, with
//     fields: its count) or cut (long_row, with extra: the cut fields) to the first record's
//     width;
//   - each error is {code, line, row}: line the 1-based line its record starts on (every LF,
//     CRLF and lone CR inside a quoted field counted), row its record's index in rows (null
//     for the header), in the order met, a field's quote_junk when the field ends and a
//     record's short_row or long_row when the record ends.
//
// Speed: instead of the reference's character-at-a-time scan with string concatenation,
// this scans with indexOf (native memchr) and slices fields out of the text whole. The
// common unquoted field is one slice; quoted fields are sliced segment by segment between
// quotes and line breaks. No dependencies. Pure: no clock, no randomness, no locale,
// nothing kept from one call to the next.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `init` up to the next comma or line break: a CR not followed
  // by LF is dropped (stray_cr). Returns the field, how it ended, and `added`, the characters kept.
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let m = comma;
      let kind = COMMA;
      if (lf !== -1 && (m === -1 || lf < m)) {
        m = lf;
        kind = LINE_BREAK;
      }
      if (cr !== -1 && (m === -1 || cr < m)) {
        m = cr;
        kind = 2; // CR
      }
      if (m === -1) {
        if (pos < n) {
          value += text.slice(pos);
          added += n - pos;
        }
        pos = n;
        return { value, ended: END, added };
      }
      if (kind === COMMA) {
        if (m > pos) {
          value += text.slice(pos, m);
          added += m - pos;
        }
        pos = m + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === LINE_BREAK) {
        if (m > pos) {
          value += text.slice(pos, m);
          added += m - pos;
        }
        pos = m + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: CRLF ends the record, a lone CR is dropped (stray_cr) and the field goes on.
      if (m + 1 < n && text.charCodeAt(m + 1) === 10) {
        if (m > pos) {
          value += text.slice(pos, m);
          added += m - pos;
        }
        pos = m + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (m > pos) {
        value += text.slice(pos, m);
        added += m - pos;
      }
      error('stray_cr');
      pos = m + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is
        // read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      const lf = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let m = q;
      let kind = 0; // 0 quote, 1 LF, 2 CR
      if (lf !== -1 && lf < m) {
        m = lf;
        kind = 1;
      }
      if (cr !== -1 && cr < m) {
        m = cr;
        kind = 2;
      }
      if (kind === 0) {
        if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
          // A doubled quote is one quote in the value.
          value += text.slice(segStart, q);
          value += '"';
          pos = q + 2;
          segStart = pos;
          continue;
        }
        // The closing quote.
        value += text.slice(segStart, q);
        pos = q + 1;
        if (pos >= n) return { value, ended: END };
        const c = text.charCodeAt(pos);
        if (c === 44) {
          pos += 1;
          return { value, ended: COMMA };
        }
        if (c === 10) {
          pos += 1;
          line += 1;
          return { value, ended: LINE_BREAK };
        }
        if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return { value, ended: LINE_BREAK };
        }
        // What follows the closing quote is appended as it stands, up to the next
        // comma or line break.
        const junk = readUnquoted(value);
        if (junk.added > 0) error('quote_junk');
        return junk;
      }
      // A line break inside quotes is one LF in the value.
      value += text.slice(segStart, m);
      value += '\n';
      line += 1;
      pos = m + 1;
      if (kind === 2 && pos < n && text.charCodeAt(pos) === 10) pos += 1;
      segStart = pos;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a record holding no quote at all. Its fields are the line's comma-separated
    // slices, split natively, with a trailing CR stripped only for a real CRLF. Any quote, or
    // any CR that is not the CRLF's, falls back to the per-field reader below.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const qIdx = text.indexOf('"', pos);
    let fields;
    let quoted = false;
    if (qIdx === -1 || qIdx >= lineEnd) {
      const crIdx = text.indexOf('\r', pos);
      let lineText;
      if (crIdx === -1 || crIdx >= lineEnd) {
        lineText = text.slice(pos, lineEnd);
      } else if (crIdx === lineEnd - 1 && nl !== -1) {
        lineText = text.slice(pos, lineEnd - 1);
      }
      if (lineText !== undefined) {
        fields = lineText.split(',');
        pos = nl === -1 ? n : nl + 1;
        if (nl !== -1) line += 1;
      }
    }
    if (fields === undefined) {
      fields = [];
      let field;
      do {
        quoted = pos < n && text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
