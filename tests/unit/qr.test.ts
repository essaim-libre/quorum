import { describe, expect, it } from "vitest";
import {
  buildQrSvgData,
  computeFormatBitsM,
  computeVersionBits,
  generateQrMatrix,
} from "@/lib/qr";

describe("générateur QR Code ISO/IEC 18004 autonome (J6)", () => {
  it("calcule les bits de format BCH(15,5) exacts pour le niveau M (ISO 18004 Annexe C)", () => {
    expect(computeFormatBitsM(0)).toBe(0x5412);
    expect(computeFormatBitsM(1)).toBe(0x5125);
    expect(computeFormatBitsM(2)).toBe(0x5e7c);
    expect(computeFormatBitsM(3)).toBe(0x5b4b);
    expect(computeFormatBitsM(4)).toBe(0x45f9);
  });

  it("calcule les bits de version BCH(18,6) exacts pour les versions 7 à 10 (ISO 18004 Annexe D)", () => {
    expect(computeVersionBits(7)).toBe(0x07c94);
    expect(computeVersionBits(8)).toBe(0x085bc);
    expect(computeVersionBits(9)).toBe(0x09a99);
    expect(computeVersionBits(10)).toBe(0x0a4d3);
  });

  it("génère une matrice valide avec repères, synchronisation et module sombre fixe", () => {
    const url = "https://quorum.u-bordeaux.fr/votes/bloquer-peixotto-30-nov";
    const qr = generateQrMatrix(url);

    expect(qr.version).toBeGreaterThanOrEqual(3);
    expect(qr.size).toBe(17 + 4 * qr.version);
    expect(qr.mask).toBeGreaterThanOrEqual(0);
    expect(qr.mask).toBeLessThanOrEqual(7);

    // Vérifie les 3 motifs de repérage 7x7 (haut-gauche, haut-droite, bas-gauche)
    const corners: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [0, qr.size - 7],
      [qr.size - 7, 0],
    ];
    for (const [top, left] of corners) {
      for (let dr = 0; dr < 7; dr += 1) {
        for (let dc = 0; dc < 7; dc += 1) {
          const isOuterBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const isCenterSquare = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          expect(qr.modules[top + dr]?.[left + dc]).toBe(
            isOuterBorder || isCenterSquare,
          );
        }
      }
    }

    // Vérifie les lignes de synchronisation (ligne 6 et colonne 6 entre 8 et size-9)
    for (let i = 8; i < qr.size - 8; i += 1) {
      expect(qr.modules[6]?.[i]).toBe(i % 2 === 0);
      expect(qr.modules[i]?.[6]).toBe(i % 2 === 0);
    }

    // Module sombre fixe à (size - 8, 8)
    expect(qr.modules[qr.size - 8]?.[8]).toBe(true);
  });

  it("produit un chemin SVG déterministe avec marge de silence de 4 modules", () => {
    const url = "http://localhost:3000/votes/scrutin-test";
    const svg1 = buildQrSvgData(url);
    const svg2 = buildQrSvgData(url);

    expect(svg1).toEqual(svg2);
    expect(svg1.viewBoxSize).toBe(svg1.size + 8);
    expect(svg1.pathData.startsWith("M4,4h1v1h-1z")).toBe(true);
  });

  it("monte en version jusqu'à 10 pour les URL longues et refuse les entrées vides ou trop longues", () => {
    const longUrl = `https://quorum.u-bordeaux.fr/votes/${"a".repeat(150)}`;
    const qrLong = generateQrMatrix(longUrl);
    expect(qrLong.version).toBeGreaterThanOrEqual(8);
    expect(qrLong.version).toBeLessThanOrEqual(10);

    expect(() => generateQrMatrix("")).toThrow("qr_payload_empty");
    expect(() => generateQrMatrix("x".repeat(250))).toThrow(
      "qr_payload_too_long",
    );
  });
});
