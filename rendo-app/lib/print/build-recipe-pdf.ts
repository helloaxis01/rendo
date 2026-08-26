import type { RecipePrintContent } from "@/lib/print/recipe-print-content";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 48;
const LEFT_COL_WIDTH = 190;
const RIGHT_COL_X = MARGIN_X + LEFT_COL_WIDTH + 24;

type PdfFont = "regular" | "bold";

type DrawCommand =
  | { kind: "text"; x: number; y: number; text: string; size: number; font: PdfFont }
  | { kind: "rect"; x: number; y: number; w: number; h: number };

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (next.length <= maxChars) {
      current = next;
    } else {
      lines.push(current);
      current = words[i] ?? "";
    }
  }
  lines.push(current);
  return lines;
}

function layoutRecipePdf(content: RecipePrintContent): DrawCommand[] {
  const commands: DrawCommand[] = [];
  let y = PAGE_HEIGHT - MARGIN_TOP;

  commands.push({
    kind: "text",
    x: MARGIN_X,
    y,
    text: "RENDO",
    size: 11,
    font: "bold",
  });
  y -= 28;

  commands.push({
    kind: "text",
    x: MARGIN_X,
    y,
    text: content.title,
    size: 20,
    font: "bold",
  });
  y -= 22;

  commands.push({
    kind: "text",
    x: MARGIN_X,
    y,
    text: content.meta.join(" · "),
    size: 9,
    font: "regular",
  });
  y -= 28;

  const leftStartY = y;
  let leftY = leftStartY;
  let rightY = leftStartY;

  commands.push({
    kind: "text",
    x: MARGIN_X,
    y: leftY,
    text: "Ingredients",
    size: 9,
    font: "bold",
  });
  leftY -= 16;

  for (const group of content.ingredientGroups) {
    if (group.section) {
      commands.push({
        kind: "text",
        x: MARGIN_X,
        y: leftY,
        text: group.section,
        size: 8,
        font: "bold",
      });
      leftY -= 13;
    }
    for (const item of group.items) {
      commands.push({
        kind: "rect",
        x: MARGIN_X,
        y: leftY - 8,
        w: 8,
        h: 8,
      });
      for (const line of wrapText(item, 28)) {
        commands.push({
          kind: "text",
          x: MARGIN_X + 14,
          y: leftY,
          text: line,
          size: 9,
          font: "regular",
        });
        leftY -= 13;
      }
      leftY -= 2;
    }
    leftY -= 4;
  }

  commands.push({
    kind: "text",
    x: RIGHT_COL_X,
    y: rightY,
    text: "Steps",
    size: 9,
    font: "bold",
  });
  rightY -= 16;

  for (const step of content.steps) {
    const prefix = `${step.number}. `;
    const lines = wrapText(step.instruction, 58);
    lines.forEach((line, index) => {
      commands.push({
        kind: "text",
        x: RIGHT_COL_X,
        y: rightY,
        text: index === 0 ? `${prefix}${line}` : line,
        size: 9,
        font: "regular",
      });
      rightY -= 13;
    });
    rightY -= 4;
  }

  const footerY = MARGIN_BOTTOM + 8;
  commands.push({
    kind: "text",
    x: MARGIN_X,
    y: footerY,
    text: content.footer,
    size: 7,
    font: "regular",
  });

  return commands;
}

function buildContentStream(commands: DrawCommand[]): string {
  const parts: string[] = [];
  let inText = false;
  let currentFont: PdfFont | null = null;
  let currentSize = 0;

  const beginText = () => {
    if (!inText) {
      parts.push("BT");
      inText = true;
    }
  };

  const endText = () => {
    if (inText) {
      parts.push("ET");
      inText = false;
      currentFont = null;
    }
  };

  for (const command of commands) {
    if (command.kind === "rect") {
      endText();
      parts.push(`${command.x} ${command.y} ${command.w} ${command.h} re S`);
      continue;
    }

    beginText();
    if (currentFont !== command.font || currentSize !== command.size) {
      parts.push(`/${command.font === "bold" ? "F2" : "F1"} ${command.size} Tf`);
      currentFont = command.font;
      currentSize = command.size;
    }
    parts.push(
      `1 0 0 1 ${command.x} ${command.y} Tm (${escapePdfText(command.text)}) Tj`
    );
  }

  endText();
  return parts.join("\n");
}

/** Minimal black-and-white PDF for sharing and printing. */
export function buildRecipePdf(content: RecipePrintContent): Uint8Array {
  const stream = buildContentStream(layoutRecipePdf(content));
  const streamLength = new TextEncoder().encode(stream).length;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}
