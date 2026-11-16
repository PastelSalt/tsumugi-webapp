// Checks that a file's first bytes match what its extension claims (PLAN-B-10 section 6.8). A renamed executable or
// script is refused. Text types must be valid UTF-8 without null bytes.
const starts = (buf, ...bytes) => bytes.every((b, i) => buf[i] === b)
const ascii = (buf, from, text) => buf.subarray(from, from + text.length).toString('latin1') === text
const isText = (buf) => {
  const head = buf.subarray(0, 8192)
  if (head.includes(0)) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, head.length - 3)); return true } catch { return false }
}

const CHECKS = {
  png: (b) => starts(b, 0x89, 0x50, 0x4e, 0x47),
  jpg: (b) => starts(b, 0xff, 0xd8, 0xff),
  jpeg: (b) => starts(b, 0xff, 0xd8, 0xff),
  gif: (b) => ascii(b, 0, 'GIF8'),
  webp: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'),
  pdf: (b) => ascii(b, 0, '%PDF'),
  docx: (b) => starts(b, 0x50, 0x4b), xlsx: (b) => starts(b, 0x50, 0x4b), pptx: (b) => starts(b, 0x50, 0x4b), odt: (b) => starts(b, 0x50, 0x4b),
  ods: (b) => starts(b, 0x50, 0x4b), epub: (b) => starts(b, 0x50, 0x4b), zip: (b) => starts(b, 0x50, 0x4b),
  doc: (b) => starts(b, 0xd0, 0xcf, 0x11, 0xe0),
  rtf: (b) => ascii(b, 0, '{\rtf'),
  mp3: (b) => ascii(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  wav: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE'),
  ogg: (b) => ascii(b, 0, 'OggS'),
  flac: (b) => ascii(b, 0, 'fLaC'),
  mp4: (b) => ascii(b, 4, 'ftyp'), m4a: (b) => ascii(b, 4, 'ftyp'), mov: (b) => ascii(b, 4, 'ftyp') || ascii(b, 4, 'moov') || ascii(b, 4, 'wide') || ascii(b, 4, 'mdat'),
  webm: (b) => starts(b, 0x1a, 0x45, 0xdf, 0xa3),
  svg: (b) => isText(b) && /<svg[\s>]/i.test(b.subarray(0, 4096).toString('utf8')),
  txt: isText, md: isText, csv: isText, tsv: isText, json: isText,
}

export function contentMatches(ext, buffer) {
  const check = CHECKS[ext]
  return check ? Boolean(buffer.length === 0 ? ['txt', 'md', 'csv', 'tsv', 'json'].includes(ext) : check(buffer)) : false
}
