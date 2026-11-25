/**
 * Générateur QR Code ISO/IEC 18004 autonome (zéro dépendance externe,
 * invariant n°8 : aucune ressource tierce).
 *
 * Supporte le mode Octet (UTF-8), niveau de correction M, versions 1 à 10
 * (jusqu'à 213 octets UTF-8, suffisant pour toute URL de scrutin Quorum).
 */

interface VersionSpec {
  readonly version: number;
  readonly totalCodewords: number;
  readonly ecPerBlock: number;
  readonly group1Blocks: number;
  readonly group1Data: number;
  readonly group2Blocks: number;
  readonly group2Data: number;
  readonly alignmentCenters: readonly number[];
}

// Tables ISO/IEC 18004 (niveau M, versions 1 à 10)
const VERSION_SPECS: readonly VersionSpec[] = [
  {
    version: 1,
    totalCodewords: 26,
    ecPerBlock: 10,
    group1Blocks: 1,
    group1Data: 16,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [],
  },
  {
    version: 2,
    totalCodewords: 44,
    ecPerBlock: 16,
    group1Blocks: 1,
    group1Data: 28,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [6, 18],
  },
  {
    version: 3,
    totalCodewords: 70,
    ecPerBlock: 26,
    group1Blocks: 1,
    group1Data: 44,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [6, 22],
  },
  {
    version: 4,
    totalCodewords: 100,
    ecPerBlock: 18,
    group1Blocks: 2,
    group1Data: 32,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [6, 26],
  },
  {
    version: 5,
    totalCodewords: 134,
    ecPerBlock: 24,
    group1Blocks: 2,
    group1Data: 43,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [6, 30],
  },
  {
    version: 6,
    totalCodewords: 172,
    ecPerBlock: 16,
    group1Blocks: 4,
    group1Data: 27,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [6, 34],
  },
  {
    version: 7,
    totalCodewords: 196,
    ecPerBlock: 18,
    group1Blocks: 4,
    group1Data: 31,
    group2Blocks: 0,
    group2Data: 0,
    alignmentCenters: [6, 22, 38],
  },
  {
    version: 8,
    totalCodewords: 242,
    ecPerBlock: 22,
    group1Blocks: 2,
    group1Data: 38,
    group2Blocks: 2,
    group2Data: 39,
    alignmentCenters: [6, 24, 42],
  },
  {
    version: 9,
    totalCodewords: 292,
    ecPerBlock: 22,
    group1Blocks: 3,
    group1Data: 36,
    group2Blocks: 2,
    group2Data: 37,
    alignmentCenters: [6, 26, 46],
  },
  {
    version: 10,
    totalCodewords: 346,
    ecPerBlock: 26,
    group1Blocks: 4,
    group1Data: 43,
    group2Blocks: 1,
    group2Data: 44,
    alignmentCenters: [6, 28, 50],
  },
];

// Corps fini GF(256) avec polynôme primitif x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if ((x & 0x100) !== 0) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255] ?? 0;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[(GF_LOG[a] ?? 0) + (GF_LOG[b] ?? 0)] ?? 0;
}

function buildReedSolomonDivisor(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i] ?? 1;
    for (let j = 0; j < poly.length; j += 1) {
      const coeff = poly[j] ?? 0;
      next[j] = (next[j] ?? 0) ^ coeff;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(coeff, root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomonRemainder(
  data: Uint8Array,
  ecLength: number,
): Uint8Array {
  const divisor = buildReedSolomonDivisor(ecLength);
  const remainder = new Uint8Array(ecLength);
  for (let i = 0; i < data.length; i += 1) {
    const factor = (data[i] ?? 0) ^ (remainder[0] ?? 0);
    for (let j = 0; j < ecLength - 1; j += 1) {
      remainder[j] = remainder[j + 1] ?? 0;
    }
    remainder[ecLength - 1] = 0;
    for (let j = 0; j < ecLength; j += 1) {
      remainder[j] = (remainder[j] ?? 0) ^ gfMul(divisor[j + 1] ?? 0, factor);
    }
  }
  return remainder;
}

export function computeFormatBitsM(mask: number): number {
  // Indicateur de niveau M = 00
  const data = (0b00 << 3) | (mask & 0b111);
  let rem = data << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if (((rem >> (i + 10)) & 1) !== 0) {
      rem ^= 0x537 << i;
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

export function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 5; i >= 0; i -= 1) {
    if (((rem >> (i + 12)) & 1) !== 0) {
      rem ^= 0x1f25 << i;
    }
  }
  return (version << 12) | rem;
}

function selectVersion(byteLength: number): VersionSpec {
  for (const spec of VERSION_SPECS) {
    const dataCodewords =
      spec.group1Blocks * spec.group1Data +
      spec.group2Blocks * spec.group2Data;
    const countBits = spec.version <= 9 ? 8 : 16;
    const capacityBytes = Math.floor((dataCodewords * 8 - 4 - countBits) / 8);
    if (byteLength <= capacityBytes) {
      return spec;
    }
  }
  throw new Error("qr_payload_too_long");
}

function encodeDataCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const dataCodewords =
    spec.group1Blocks * spec.group1Data + spec.group2Blocks * spec.group2Data;
  const maxBits = dataCodewords * 8;
  const bits: number[] = [];

  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i -= 1) {
      bits.push((value >> i) & 1);
    }
  };

  // Mode Octet (0100) + compteur de longueur
  pushBits(0b0100, 4);
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);

  for (let i = 0; i < bytes.length; i += 1) {
    pushBits(bytes[i] ?? 0, 8);
  }

  // Terminateur (jusqu'à 4 zéros)
  const terminatorLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminatorLen; i += 1) {
    bits.push(0);
  }

  // Alignement sur l'octet
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const out = new Uint8Array(dataCodewords);
  let byteIndex = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j += 1) {
      val = (val << 1) | (bits[i + j] ?? 0);
    }
    out[byteIndex] = val;
    byteIndex += 1;
  }

  // Octets de bourrage alternés 0xEC, 0x11
  let padToggle = true;
  while (byteIndex < dataCodewords) {
    out[byteIndex] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
    byteIndex += 1;
  }

  return out;
}

function interleaveBlocks(
  dataCodewords: Uint8Array,
  spec: VersionSpec,
): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < spec.group1Blocks; i += 1) {
    const block = dataCodewords.slice(offset, offset + spec.group1Data);
    offset += spec.group1Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonRemainder(block, spec.ecPerBlock));
  }

  for (let i = 0; i < spec.group2Blocks; i += 1) {
    const block = dataCodewords.slice(offset, offset + spec.group2Data);
    offset += spec.group2Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonRemainder(block, spec.ecPerBlock));
  }

  const result = new Uint8Array(spec.totalCodewords);
  let outIdx = 0;
  const maxDataLen = Math.max(spec.group1Data, spec.group2Data);

  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        result[outIdx] = block[i] ?? 0;
        outIdx += 1;
      }
    }
  }

  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const ec of ecBlocks) {
      result[outIdx] = ec[i] ?? 0;
      outIdx += 1;
    }
  }

  return result;
}

function createMatrix(size: number): boolean[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );
}

function setModule(
  modules: boolean[][],
  isFunction: boolean[][],
  row: number,
  col: number,
  dark: boolean,
): void {
  const mRow = modules[row];
  const fRow = isFunction[row];
  if (mRow && fRow && col >= 0 && col < mRow.length) {
    mRow[col] = dark;
    fRow[col] = true;
  }
}

function drawFinderPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  topRow: number,
  leftCol: number,
): void {
  const size = modules.length;
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const r = topRow + dr;
      const c = leftCol + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) {
        continue;
      }
      const inOuter =
        dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
        (dr === 0 || dr === 6 || dc === 0 || dc === 6);
      const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      setModule(modules, isFunction, r, c, inOuter || inInner);
    }
  }
}

function drawAlignmentPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  centerRow: number,
  centerCol: number,
): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      setModule(
        modules,
        isFunction,
        centerRow + dr,
        centerCol + dc,
        dist !== 1,
      );
    }
  }
}

function drawFormatBits(
  modules: boolean[][],
  isFunction: boolean[][],
  mask: number,
): void {
  const size = modules.length;
  const bits = computeFormatBitsM(mask);

  // Copie 1 autour du motif haut-gauche
  for (let i = 0; i <= 5; i += 1) {
    setModule(modules, isFunction, i, 8, ((bits >> i) & 1) !== 0);
  }
  setModule(modules, isFunction, 7, 8, ((bits >> 6) & 1) !== 0);
  setModule(modules, isFunction, 8, 8, ((bits >> 7) & 1) !== 0);
  setModule(modules, isFunction, 8, 7, ((bits >> 8) & 1) !== 0);
  for (let i = 9; i < 15; i += 1) {
    setModule(modules, isFunction, 8, 14 - i, ((bits >> i) & 1) !== 0);
  }

  // Copie 2 (haut-droite et bas-gauche) + module sombre fixe
  for (let i = 0; i < 8; i += 1) {
    setModule(modules, isFunction, 8, size - 1 - i, ((bits >> i) & 1) !== 0);
  }
  for (let i = 8; i < 15; i += 1) {
    setModule(modules, isFunction, size - 15 + i, 8, ((bits >> i) & 1) !== 0);
  }
  setModule(modules, isFunction, size - 8, 8, true);
}

function drawVersionBits(
  modules: boolean[][],
  isFunction: boolean[][],
  version: number,
): void {
  if (version < 7) {
    return;
  }
  const size = modules.length;
  const bits = computeVersionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setModule(modules, isFunction, b, a, dark);
    setModule(modules, isFunction, a, b, dark);
  }
}

function drawFunctionPatterns(
  modules: boolean[][],
  isFunction: boolean[][],
  spec: VersionSpec,
): void {
  const size = modules.length;

  // Lignes de synchronisation
  for (let i = 0; i < size; i += 1) {
    setModule(modules, isFunction, 6, i, i % 2 === 0);
    setModule(modules, isFunction, i, 6, i % 2 === 0);
  }

  // Trois motifs de repérage
  drawFinderPattern(modules, isFunction, 0, 0);
  drawFinderPattern(modules, isFunction, 0, size - 7);
  drawFinderPattern(modules, isFunction, size - 7, 0);

  // Motifs d'alignement
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = 0; j < centers.length; j += 1) {
      const isCornerOverlap =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (!isCornerOverlap) {
        drawAlignmentPattern(
          modules,
          isFunction,
          centers[i] ?? 0,
          centers[j] ?? 0,
        );
      }
    }
  }

  // Réservation des emplacements format & version (remplis après masquage)
  drawFormatBits(modules, isFunction, 0);
  drawVersionBits(modules, isFunction, spec.version);
}

function drawCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: Uint8Array,
): void {
  const size = modules.length;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vert = 0; vert < size; vert += 1) {
      const upward = ((right + 1) & 2) === 0;
      const row = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        if (isFunction[row]?.[col]) {
          continue;
        }
        let dark = false;
        if (bitIndex < totalBits) {
          const byteVal = codewords[bitIndex >>> 3] ?? 0;
          dark = ((byteVal >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex += 1;
        }
        const mRow = modules[row];
        if (mRow) {
          mRow[col] = dark;
        }
      }
    }
  }
}

function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function applyMask(
  modules: boolean[][],
  isFunction: boolean[][],
  mask: number,
): void {
  const size = modules.length;
  for (let r = 0; r < size; r += 1) {
    const mRow = modules[r];
    const fRow = isFunction[r];
    if (!mRow || !fRow) {
      continue;
    }
    for (let c = 0; c < size; c += 1) {
      if (!fRow[c] && maskCondition(mask, r, c)) {
        mRow[c] = !mRow[c];
      }
    }
  }
}

function evaluatePenalty(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // Règle 1 : séries horizontales et verticales >= 5
  for (let r = 0; r < size; r += 1) {
    let runColor = false;
    let runLen = 0;
    for (let c = 0; c < size; c += 1) {
      const dark = modules[r]?.[c] ?? false;
      if (dark === runColor) {
        runLen += 1;
        if (runLen === 5) {
          penalty += 3;
        } else if (runLen > 5) {
          penalty += 1;
        }
      } else {
        runColor = dark;
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = false;
    let runLen = 0;
    for (let r = 0; r < size; r += 1) {
      const dark = modules[r]?.[c] ?? false;
      if (dark === runColor) {
        runLen += 1;
        if (runLen === 5) {
          penalty += 3;
        } else if (runLen > 5) {
          penalty += 1;
        }
      } else {
        runColor = dark;
        runLen = 1;
      }
    }
  }

  // Règle 2 : blocs 2x2 de même couleur
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const color = modules[r]?.[c] ?? false;
      if (
        color === (modules[r]?.[c + 1] ?? false) &&
        color === (modules[r + 1]?.[c] ?? false) &&
        color === (modules[r + 1]?.[c + 1] ?? false)
      ) {
        penalty += 3;
      }
    }
  }

  // Règle 3 : motifs proches des repères (10111010000 ou 00001011101)
  const finderPatternPenalty = (line: boolean[]): number => {
    let score = 0;
    for (let i = 0; i <= line.length - 11; i += 1) {
      const p1 =
        line[i] &&
        !line[i + 1] &&
        line[i + 2] &&
        line[i + 3] &&
        line[i + 4] &&
        !line[i + 5] &&
        line[i + 6] &&
        !line[i + 7] &&
        !line[i + 8] &&
        !line[i + 9] &&
        !line[i + 10];
      const p2 =
        !line[i] &&
        !line[i + 1] &&
        !line[i + 2] &&
        !line[i + 3] &&
        line[i + 4] &&
        !line[i + 5] &&
        line[i + 6] &&
        line[i + 7] &&
        line[i + 8] &&
        !line[i + 9] &&
        line[i + 10];
      if (p1 || p2) {
        score += 40;
      }
    }
    return score;
  };

  for (let r = 0; r < size; r += 1) {
    penalty += finderPatternPenalty(modules[r] ?? []);
  }
  for (let c = 0; c < size; c += 1) {
    const col: boolean[] = [];
    for (let r = 0; r < size; r += 1) {
      col.push(modules[r]?.[c] ?? false);
    }
    penalty += finderPatternPenalty(col);
  }

  // Règle 4 : équilibre clair / sombre
  let darkCount = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r]?.[c]) {
        darkCount += 1;
      }
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
}

export interface QrMatrix {
  readonly version: number;
  readonly size: number;
  readonly mask: number;
  readonly modules: readonly (readonly boolean[])[];
}

export function generateQrMatrix(text: string): QrMatrix {
  if (text.length === 0) {
    throw new Error("qr_payload_empty");
  }
  const bytes = new TextEncoder().encode(text);
  const spec = selectVersion(bytes.length);
  const size = 17 + 4 * spec.version;

  const dataCodewords = encodeDataCodewords(bytes, spec);
  const allCodewords = interleaveBlocks(dataCodewords, spec);

  const modules = createMatrix(size);
  const isFunction = createMatrix(size);

  drawFunctionPatterns(modules, isFunction, spec);
  drawCodewords(modules, isFunction, allCodewords);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(modules, isFunction, mask);
    drawFormatBits(modules, isFunction, mask);
    const penalty = evaluatePenalty(modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(modules, isFunction, mask);
  }

  applyMask(modules, isFunction, bestMask);
  drawFormatBits(modules, isFunction, bestMask);

  return {
    version: spec.version,
    size,
    mask: bestMask,
    modules,
  };
}

/**
 * Produit un chemin SVG (`d`) pour tous les modules sombres, avec marge de silence (quiet zone)
 * de 4 modules conformément à ISO/IEC 18004.
 */
export function buildQrSvgData(
  text: string,
  quietZone = 4,
): {
  readonly version: number;
  readonly size: number;
  readonly viewBoxSize: number;
  readonly pathData: string;
} {
  const qr = generateQrMatrix(text);
  const viewBoxSize = qr.size + quietZone * 2;
  const parts: string[] = [];

  for (let r = 0; r < qr.size; r += 1) {
    const row = qr.modules[r];
    if (!row) {
      continue;
    }
    for (let c = 0; c < qr.size; c += 1) {
      if (row[c]) {
        parts.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }

  return {
    version: qr.version,
    size: qr.size,
    viewBoxSize,
    pathData: parts.join(""),
  };
}
