import "server-only";
import {
  formatDateTimeParis,
  formatNumberFr,
  formatPercentFr,
} from "@/lib/dates";
import { formatOutcomeHeadline, type TallySummary } from "@/lib/votes/tally";

export interface ProcesVerbalInput {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly originDetail: string | null;
  readonly statusNote: string;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly keyFingerprint: string;
  readonly receiptsCount: number;
  readonly receiptsHash: string;
  readonly tally: TallySummary;
  readonly generatedAt: Date;
}

const WIN_ANSI_EXTRAS: Record<number, number> = {
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x2026: 0x85, // …
  0x0152: 0x8c, // Œ
  0x0153: 0x9c, // œ
  0x20ac: 0x80, // €
  0x00a0: 0x20, // NBSP -> espace
  0x202f: 0x20, // espace fine insécable -> espace
};

function encodePdfWinAnsiLiteral(text: string): string {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const mapped = WIN_ANSI_EXTRAS[code] ?? (code <= 0xff ? code : 0x3f);
    if (mapped === 0x28 || mapped === 0x29 || mapped === 0x5c) {
      parts.push(`\\${String.fromCharCode(mapped)}`);
    } else if (mapped >= 0x20 && mapped <= 0x7e) {
      parts.push(String.fromCharCode(mapped));
    } else {
      parts.push(`\\${mapped.toString(8).padStart(3, "0")}`);
    }
  }
  return `(${parts.join("")})`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * Génère un procès-verbal PDF 1.4 monochrome autonome (zéro dépendance externe)
 * conforme aux exigences du cahier (§1, §6.6, §10).
 */
export function generateProcesVerbalPdf(input: ProcesVerbalInput): Buffer {
  const commands: string[] = [];
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const marginX = 48;
  const contentWidth = pageWidth - marginX * 2;
  let y = pageHeight - 54;

  const drawText = (
    text: string,
    font: "F1" | "F2" | "F3",
    size: number,
    x = marginX,
  ) => {
    commands.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${encodePdfWinAnsiLiteral(text)} Tj ET`,
    );
  };

  const drawRule = (weight = 1, gray = 0.04) => {
    commands.push(
      `${gray} G ${weight} w ${marginX.toFixed(2)} ${y.toFixed(2)} m ${(marginX + contentWidth).toFixed(2)} ${y.toFixed(2)} l S 0 G`,
    );
  };

  // En-tête institutionnel
  drawRule(1.2, 0.04);
  y -= 18;
  drawText("QUORUM — PROCES-VERBAL DE SCRUTIN", "F2", 11);
  drawText("Universite de Bordeaux", "F3", 9, pageWidth - marginX - 135);
  y -= 14;
  drawRule(0.5, 0.82);
  y -= 28;

  // Question
  for (const line of wrapText(input.question, 56)) {
    drawText(line, "F2", 17);
    y -= 22;
  }

  if (input.originDetail) {
    y -= 2;
    for (const line of wrapText(`Origine : ${input.originDetail}`, 84)) {
      drawText(line, "F1", 10);
      y -= 14;
    }
  }

  y -= 10;
  drawRule(1, 0.04);
  y -= 18;

  // Issue du scrutin
  drawText("RESULTAT", "F2", 9);
  y -= 18;
  drawText(formatOutcomeHeadline(input.tally.outcome), "F2", 15);
  y -= 22;

  // Détail des options (suffrages exprimés)
  for (const opt of input.tally.options) {
    const pctLabel =
      opt.expressedPercent !== null
        ? `${opt.expressedPercent.toFixed(1).replace(".", ",")} %`
        : "—";
    const line = `${opt.label}`;
    const metrics = `${pctLabel}  (${formatNumberFr(opt.count)} voix)`;
    drawText(line, "F1", 11);
    drawText(metrics, "F3", 10, pageWidth - marginX - 180);
    y -= 18;
  }

  if (input.tally.blankOption) {
    y -= 4;
    drawRule(0.5, 0.85);
    y -= 16;
    drawText("Vote blanc (compte a part)", "F1", 10);
    drawText(
      `${formatNumberFr(input.tally.blankCount)} bulletins`,
      "F3",
      10,
      pageWidth - marginX - 180,
    );
    y -= 20;
  }

  y -= 8;
  drawRule(1, 0.04);
  y -= 18;

  // Participation & intégrité (§6.6)
  drawText("PARTICIPATION ET CONTROLE D'INTEGRITE", "F2", 9);
  y -= 18;

  const statsRows: Array<[string, string]> = [
    [
      "Participation",
      `${formatNumberFr(input.tally.totalBallots)} votants sur ${formatNumberFr(input.tally.electorateSize)} inscrits (${formatPercentFr(input.tally.participationRate)})`,
    ],
    ["Suffrages exprimes", `${formatNumberFr(input.tally.expressedCount)}`],
    ["Votes blancs", `${formatNumberFr(input.tally.blankCount)}`],
    [
      "Bulletins / Jetons emis",
      `${formatNumberFr(input.tally.totalBallots)} bulletins · ${input.tally.tokensIssued !== null ? formatNumberFr(input.tally.tokensIssued) : "N/A"} jetons emis`,
    ],
    [
      "Controle public (bulletins <= jetons emis)",
      input.tally.integrityBallotsLeqTokens ? "Conforme" : "Anomalie detectee",
    ],
    ["Recus publies", `${formatNumberFr(input.receiptsCount)}`],
  ];

  for (const [label, value] of statsRows) {
    drawText(label, "F1", 10);
    drawText(value, "F3", 9, marginX + 215);
    y -= 16;
  }

  y -= 10;
  drawRule(1, 0.04);
  y -= 18;

  // Règles & calendrier
  drawText("REGLES ET CALENDRIER (EUROPE/PARIS)", "F2", 9);
  y -= 18;

  const metaRows: Array<[string, string]> = [
    ["Ouverture", formatDateTimeParis(input.opensAt)],
    ["Echeance", formatDateTimeParis(input.closesAt)],
    ["Regle de resultat", "Majorite des suffrages exprimes, blancs a part, sans quorum"],
    ["Statut", input.statusNote],
    ["Identifiant scrutin", `${input.slug} (${input.voteId})`],
  ];

  for (const [label, value] of metaRows) {
    drawText(label, "F1", 10);
    const wrapped = wrapText(value, 54);
    for (const part of wrapped) {
      drawText(part, "F3", 9, marginX + 140);
      y -= 14;
    }
    y -= 2;
  }

  y -= 10;
  drawRule(1, 0.04);
  y -= 18;

  // Empreintes cryptographiques
  drawText("EMPREINTES CRYPTOGRAPHIQUES (SHA-256)", "F2", 9);
  y -= 16;
  drawText("Cle publique du scrutin (SPKI) :", "F1", 9);
  y -= 13;
  drawText(input.keyFingerprint, "F3", 8);
  y -= 16;
  drawText("Liste triee des recus publics :", "F1", 9);
  y -= 13;
  drawText(input.receiptsHash, "F3", 8);

  // Pied de page
  y = 48;
  drawRule(0.5, 0.82);
  y -= 14;
  drawText(
    `Document genere le ${formatDateTimeParis(input.generatedAt)} — Quorum (signatures aveugles RFC 9474)`,
    "F3",
    8,
  );

  const streamContent = `${commands.join("\n")}\n`;
  const streamBytes = Buffer.byteLength(streamContent, "latin1");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n",
    `7 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  const chunks: string[] = ["%PDF-1.4\n%\xFF\xFF\xFF\xFF\n"];
  const offsets: number[] = [0];
  let currentOffset = Buffer.byteLength(chunks[0] ?? "", "latin1");

  for (const obj of objects) {
    offsets.push(currentOffset);
    chunks.push(obj);
    currentOffset += Buffer.byteLength(obj, "latin1");
  }

  const xrefStart = currentOffset;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
  ];
  for (let i = 1; i < offsets.length; i += 1) {
    const off = offsets[i] ?? 0;
    xrefLines.push(`${String(off).padStart(10, "0")} 00000 n \n`);
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(...xrefLines, trailer);

  return Buffer.from(chunks.join(""), "latin1");
}
