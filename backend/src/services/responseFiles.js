const { FILE_KINDS } = require('./questions');

const SERVER_MAX_MB = 10;           // hard limit per file, whatever the question allows
const MAX_UPLOADS_PER_READER = 60;  // stops one reader filling the database before submitting

const ext = (name) => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
};

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

// The file's first bytes must match its extension (a renamed .exe is refused).
function bytesMatch(e, b) {
  const starts = (...bytes) => bytes.every((x, i) => b[i] === x);
  const ascii = (s, at = 0) => b.slice(at, at + s.length).toString('ascii') === s;
  switch (e) {
    case 'png': return starts(0x89, 0x50, 0x4e, 0x47);
    case 'jpg': case 'jpeg': return starts(0xff, 0xd8, 0xff);
    case 'gif': return ascii('GIF8');
    case 'webp': return ascii('RIFF') && ascii('WEBP', 8);
    case 'pdf': return ascii('%PDF');
    case 'docx': case 'xlsx': case 'pptx': case 'odt': case 'ods': case 'odp': return starts(0x50, 0x4b);
    case 'doc': case 'xls': case 'ppt': return starts(0xd0, 0xcf, 0x11, 0xe0);
    case 'rtf': return ascii('{\\rtf');
    case 'txt': case 'csv': return !b.includes(0); // plain text has no zero bytes
    default: return false;
  }
}

// Returns { error } or { mimeType }
function checkUpload(file, settings) {
  if (!file) return { error: 'Choose a file to upload.' };
  const e = ext(file.originalname);
  const allowed = (settings.kinds || []).flatMap((k) => FILE_KINDS[k] || []);
  if (!allowed.includes(e)) return { error: `This file type is not allowed here. Allowed: ${allowed.map((x) => '.' + x).join(', ')}` };
  const maxMb = Math.min(settings.maxSizeMb || SERVER_MAX_MB, SERVER_MAX_MB);
  if (file.size > maxMb * 1024 * 1024) return { error: `The file is larger than ${maxMb} MB.` };
  if (!file.size) return { error: 'The file is empty.' };
  if (!bytesMatch(e, file.buffer)) return { error: 'The file does not look like a real .' + e + ' file.' };
  return { mimeType: MIME[e] || 'application/octet-stream' };
}

module.exports = { SERVER_MAX_MB, MAX_UPLOADS_PER_READER, checkUpload };
