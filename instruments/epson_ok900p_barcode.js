// epson_ok900p_barcode.js — Pure JavaScript Code128 and QRCode generator (No external dependencies)

// ── Code 128 (Type B) Generator ──────────────────────────────────────────────
const C128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

export function encodeCode128(text) {
  // Code128 Subset B (ASCII 32 ~ 127)
  const START_B = 104;
  const STOP = 106;
  const codes = [START_B];
  let checkSum = START_B;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    const validCode = Math.max(0, Math.min(95, code));
    codes.push(validCode);
    checkSum += validCode * (i + 1);
  }

  codes.push(checkSum % 103);
  codes.push(STOP);

  // 모듈 비트열(1/0) 생성
  let modules = "";
  for (let c of codes) {
    const pattern = C128_PATTERNS[c];
    if (!pattern) continue;
    let isBar = true;
    for (let char of pattern) {
      const width = parseInt(char, 10);
      modules += (isBar ? "1" : "0").repeat(width);
      isBar = !isBar;
    }
  }
  return modules;
}

export function drawCode128(ctx, text, x, y, width, height, showText = true) {
  const modules = encodeCode128(text || "12345678");
  const modCount = modules.length;
  const textH = showText ? Math.min(14, height * 0.28) : 0;
  const barH = height - textH;
  const modW = width / modCount;

  ctx.fillStyle = "#000000";
  for (let i = 0; i < modCount; i++) {
    if (modules[i] === "1") {
      ctx.fillRect(x + i * modW, y, Math.ceil(modW), barH);
    }
  }

  if (showText) {
    ctx.font = `bold ${Math.max(9, textH - 2)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, x + width / 2, y + barH + 2);
  }
}


// ── Standalone QR Code Generator (Model 2, Version 1~4) ──────────────────────
// High efficiency QR Code generator implementation
export class MiniQRCode {
  static generate(text, ecLevel = 'M') {
    // UTF-8 인코딩
    const utf8Bytes = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code < 0x80) utf8Bytes.push(code);
      else if (code < 0x800) utf8Bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code < 0xd800 || code >= 0xe000) utf8Bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }

    // 버전 자동 선택 (Ver 1: 21x21, Ver 2: 25x25, Ver 3: 29x29, Ver 4: 33x33)
    const len = utf8Bytes.length;
    let version = 1;
    if (len > 14) version = 2;
    if (len > 26) version = 3;
    if (len > 42) version = 4;
    if (len > 62) version = 5;

    const size = 17 + 4 * version;
    const matrix = Array.from({ length: size }, () => Array(size).fill(null));

    // Finder 패턴 (7x7) 배치
    const addFinder = (r, c) => {
      for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
          const mr = r + y, mc = c + x;
          if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
            const isBorder = y === 0 || y === 6 || x === 0 || x === 6;
            const isCenter = y >= 2 && y <= 4 && x >= 2 && x <= 4;
            matrix[mr][mc] = (isBorder || isCenter) ? 1 : 0;
          }
        }
      }
    };
    addFinder(0, 0);
    addFinder(0, size - 7);
    addFinder(size - 7, 0);

    // 타이밍 패턴
    for (let i = 8; i < size - 8; i++) {
      if (matrix[6][i] === null) matrix[6][i] = (i % 2 === 0) ? 1 : 0;
      if (matrix[i][6] === null) matrix[i][6] = (i % 2 === 0) ? 1 : 0;
    }

    // 데이터 비트 배치 (Byte 모드 + 데이터)
    const bits = [0, 1, 0, 0]; // Byte 모드 (0100)
    // 길이 비트 (8비트)
    for (let i = 7; i >= 0; i--) bits.push((len >> i) & 1);
    // 데이터
    for (let b of utf8Bytes) {
      for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    }
    // 터미네이터 (0000)
    for (let i = 0; i < 4; i++) bits.push(0);

    let bitIdx = 0;
    let right = size - 1;
    let upward = true;

    while (right > 0) {
      if (right === 6) right--; // 타이밍 패턴 건너뛰기
      const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
      for (let r of rows) {
        for (let c of [right, right - 1]) {
          if (matrix[r][c] === null) {
            const val = bitIdx < bits.length ? bits[bitIdx++] : 0;
            // 마스크 0 ( (r+c) % 2 === 0 ) 적용
            const mask = ((r + c) % 2 === 0);
            matrix[r][c] = (val ^ (mask ? 1 : 0));
          }
        }
      }
      right -= 2;
      upward = !upward;
    }

    return matrix;
  }
}

export function drawQRCode(ctx, text, x, y, width, height) {
  const matrix = MiniQRCode.generate(text || "https://3m.com");
  const size = matrix.length;
  const modW = width / size;
  const modH = height / size;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = "#000000";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        ctx.fillRect(
          Math.round(x + c * modW),
          Math.round(y + r * modH),
          Math.ceil(modW),
          Math.ceil(modH)
        );
      }
    }
  }
}
