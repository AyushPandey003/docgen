/**
 * docGenerator.js
 * Core engine — styling matches the CivicConnect Chapter 1 capstone format.
 * Font: Arial | Primary: #1F3864 | Secondary: #2E75B6
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Header, Footer, PageNumber, TabStopType, TabStopPosition
} = require("docx");
const fs = require("fs");

const FONT_NAME = "Times New Roman";
const DISPLAY_FONT = "Calibri";

// ── Font Size Hierarchy (in half-points) ─────────────────────────────────
const SZ = {
  bannerLabel:  22,   // 11pt — "CHAPTER 4" label
  bannerTitle:  52,   // 26pt — chapter title in banner
  bannerSub:    22,   // 11pt — subtitle line
  h1:           36,   // 18pt — section headings
  h2:           30,   // 15pt — sub-section headings
  h3:           26,   // 13pt — sub-sub headings
  body:         24,   // 12pt — paragraph text
  bullet:       24,   // 12pt
  tableHead:    22,   // 11pt — table headers
  tableBody:    22,   // 11pt — table cells
  small:        20,   // 10pt — captions, labels
  hf:           18,   // 9pt  — header/footer
  cardTag:      20,   // 10pt — L1/L2 tag in layer cards
  cardTitle:    24,   // 12pt — card heading text
  cardBody:     22,   // 11pt — card description
  infoTitle:    26,   // 13pt — info box heading
  infoBody:     24,   // 12pt — info box content
  summaryTitle: 28,   // 14pt — summary box heading
  summaryBody:  24,   // 12pt — summary box content
  stat:         28,   // 14pt — stat value
  statLabel:    20,   // 10pt — stat label
};

// backward-compat alias (used in a few legacy spots)
const FONT_SIZE = SZ.body;
const HF_SIZE   = SZ.hf;

/** Strip markdown formatting artifacts from text */
function clean(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

// ── Theme Definitions ──────────────────────────────────────────────────────
const THEMES = {
  blue: {
    primary:    "1F3864",
    secondary:  "2E75B6",
    tertiary:   "2F5496",
    accent:     "A8C5E8",
    lightBg:    "EBF3FB",
    rowEven:    "D6E4F0",
    rowOdd:     "F8FBFD",
    rowEvenAlt: "EBF3FB",
    bannerSub:  "C5D9F1",
  },
  green: {
    primary:    "1A3C2E",
    secondary:  "2D7A50",
    tertiary:   "1E5C3A",
    accent:     "A8D5B5",
    lightBg:    "EAF5EE",
    rowEven:    "D0EAD8",
    rowOdd:     "F5FBF7",
    rowEvenAlt: "EAF5EE",
    bannerSub:  "B2DFBD",
  },
  purple: {
    primary:    "2D1B5E",
    secondary:  "6B42C8",
    tertiary:   "4A2D9C",
    accent:     "C5B3F0",
    lightBg:    "F0EAFD",
    rowEven:    "DDD3F7",
    rowOdd:     "FAF7FF",
    rowEvenAlt: "F0EAFD",
    bannerSub:  "D4C6F5",
  },
  dark: {
    primary:    "111827",
    secondary:  "374151",
    tertiary:   "1F2937",
    accent:     "9CA3AF",
    lightBg:    "F3F4F6",
    rowEven:    "E5E7EB",
    rowOdd:     "F9FAFB",
    rowEvenAlt: "F3F4F6",
    bannerSub:  "D1D5DB",
  },
};

// ── Border Helpers ─────────────────────────────────────────────────────────
function thinB(color = "CCCCCC") {
  return { style: BorderStyle.SINGLE, size: 1, color };
}
function thickB(color) {
  return { style: BorderStyle.SINGLE, size: 3, color };
}
function allB(b) {
  return { top: b, bottom: b, left: b, right: b };
}
function noneB() {
  const n = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: n, bottom: n, left: n, right: n };
}

// ── Primitives ─────────────────────────────────────────────────────────────
function spacer(lines = 1) {
  return new Paragraph({
    children: [new TextRun({ text: "", size: FONT_SIZE, font: FONT_NAME })],
    spacing: { before: 0, after: lines * 100 },
  });
}

function makePara(text, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { before: 80, after: 80, line: 360 },
    children: [
      new TextRun({
        text: clean(text),
        size: SZ.body,
        font: FONT_NAME,
        italics: opts.italic || false,
        color: opts.color || "333333",
      }),
    ],
  });
}

function makeH1(text, theme) {
  const t = THEMES[theme] || THEMES.blue;
  return new Paragraph({
    children: [new TextRun({ text: clean(text), bold: true, size: SZ.h1, font: DISPLAY_FONT, color: t.primary, underline: { type: "single", color: t.secondary } })],
    spacing: { before: 480, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: t.primary, space: 4 } },
  });
}

function makeH2(text, theme) {
  const t = THEMES[theme] || THEMES.blue;
  return new Paragraph({
    children: [new TextRun({ text: clean(text), bold: true, size: SZ.h2, font: DISPLAY_FONT, color: t.secondary })],
    spacing: { before: 360, after: 160 },
  });
}

function makeH3(text, theme) {
  const t = THEMES[theme] || THEMES.blue;
  return new Paragraph({
    children: [new TextRun({ text: clean(text), bold: true, size: SZ.h3, font: DISPLAY_FONT, color: t.tertiary })],
    spacing: { before: 260, after: 120 },
  });
}

function makeBullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 60, after: 60, line: 320 },
    children: [new TextRun({ text: clean(text), size: SZ.bullet, font: FONT_NAME, color: "333333" })],
  });
}

function makeNumbered(text) {
  return new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    spacing: { before: 60, after: 60, line: 320 },
    children: [new TextRun({ text: clean(text), size: SZ.bullet, font: FONT_NAME, color: "333333" })],
  });
}

// ── Chapter Banner ─────────────────────────────────────────────────────────
function chapterBanner(title, subtitle, theme, chapterLabel) {
  title = clean(title);
  subtitle = clean(subtitle);
  chapterLabel = clean(chapterLabel || "GENERATED DOCUMENT");
  const t = THEMES[theme] || THEMES.blue;
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noneB(),
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: t.primary, type: ShadingType.CLEAR },
            margins: { top: 360, bottom: 360, left: 480, right: 480 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: chapterLabel.toUpperCase(), size: SZ.bannerLabel, font: DISPLAY_FONT, color: t.accent, bold: true, characterSpacing: 120 })],
                spacing: { before: 0, after: 120 },
              }),
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: title, size: SZ.bannerTitle, font: DISPLAY_FONT, color: "FFFFFF", bold: true })],
                spacing: { before: 0, after: 120 },
              }),
              ...(subtitle ? [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [new TextRun({ text: subtitle, size: SZ.bannerSub, font: DISPLAY_FONT, color: t.bannerSub, italics: true })],
                  spacing: { before: 0, after: 0 },
                }),
              ] : []),
            ],
          }),
        ],
      }),
    ],
  });
}

// ── Info Box ───────────────────────────────────────────────────────────────
function infoBox(boxTitle, lines, theme) {
  const t = THEMES[theme] || THEMES.blue;
  const tb = thickB(t.secondary);
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: tb, bottom: tb, right: tb, left: { style: BorderStyle.SINGLE, size: 12, color: t.secondary } },
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: t.lightBg, type: ShadingType.CLEAR },
            margins: { top: 160, bottom: 160, left: 280, right: 200 },
            children: [
              ...(boxTitle ? [
                new Paragraph({
                  children: [new TextRun({ text: clean(boxTitle), bold: true, size: SZ.infoTitle, font: DISPLAY_FONT, color: t.primary })],
                  spacing: { before: 60, after: 100 },
                }),
              ] : []),
              ...(Array.isArray(lines) ? lines : [lines]).map((l) =>
                new Paragraph({
                  spacing: { before: 40, after: 40, line: 340 },
                  children: [new TextRun({ text: clean(l), size: SZ.infoBody, font: FONT_NAME, color: "333333" })],
                })
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

// ── Stat Boxes Row ─────────────────────────────────────────────────────────
// stats = [{ value, label, color? }]
function statBoxRow(stats, theme) {
  const t = THEMES[theme] || THEMES.blue;
  const defaultColors = [t.secondary, "C0504D", "7030A0", "375623"];
  const GAP = 200;
  const boxW = Math.floor((9360 - GAP * (stats.length - 1)) / stats.length);

  const cells = [];
  const colWidths = [];

  stats.forEach((s, i) => {
    const color = s.color || defaultColors[i % defaultColors.length];
    cells.push(
      new TableCell({
        borders: allB(thickB(color)),
        width: { size: boxW, type: WidthType.DXA },
        shading: { fill: color, type: ShadingType.CLEAR },
        margins: { top: 160, bottom: 160, left: 120, right: 120 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: clean(s.value), bold: true, size: SZ.stat, font: DISPLAY_FONT, color: "FFFFFF" })],
            spacing: { before: 60, after: 40 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: clean(s.label), size: SZ.statLabel, font: DISPLAY_FONT, color: "FFFFFF" })],
            spacing: { before: 0, after: 60 },
          }),
        ],
      })
    );
    colWidths.push(boxW);
    if (i < stats.length - 1) {
      cells.push(
        new TableCell({
          borders: noneB(),
          width: { size: GAP, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "", size: SZ.small, font: FONT_NAME })] })],
        })
      );
      colWidths.push(GAP);
    }
  });

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [new TableRow({ children: cells })],
  });
}

// ── Standard Data Table ────────────────────────────────────────────────────
function dataTable(rows, theme) {
  const t = THEMES[theme] || THEMES.blue;
  const colCount = rows[0].length;
  const colW = Math.floor(9360 / colCount);

  const headerRow = new TableRow({
    children: rows[0].map((cell) =>
      new TableCell({
        borders: allB(thickB(t.primary)),
        width: { size: colW, type: WidthType.DXA },
        shading: { fill: t.primary, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: clean(cell), bold: true, size: FONT_SIZE, font: FONT_NAME, color: "FFFFFF" })] })],
      })
    ),
  });

  const dataRows = rows.slice(1).map((row, ri) =>
    new TableRow({
      children: row.map((cell) =>
        new TableCell({
          borders: allB(thinB("CCCCCC")),
          width: { size: colW, type: WidthType.DXA },
          shading: { fill: ri % 2 === 0 ? t.rowEven : t.rowOdd, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: clean(cell), size: FONT_SIZE, font: FONT_NAME })] })],
        })
      ),
    })
  );

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(colW),
    rows: [headerRow, ...dataRows],
  });
}

// ── Objective Table (dark label | light description) ──────────────────────
// items = [{ label, description }]
function objectiveTable(items, theme) {
  const t = THEMES[theme] || THEMES.blue;
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2200, 7160],
    rows: items.map(({ label, description }, i) =>
      new TableRow({
        children: [
          new TableCell({
            borders: allB(thickB(i % 2 === 0 ? t.primary : t.secondary)),
            width: { size: 2200, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? t.primary : t.secondary, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: clean(label), bold: true, size: FONT_SIZE, font: FONT_NAME, color: "FFFFFF" })],
              }),
            ],
          }),
          new TableCell({
            borders: allB(thinB("CCCCCC")),
            width: { size: 7160, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? "F0F5FB" : "FFFFFF", type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [new Paragraph({ children: [new TextRun({ text: clean(description), size: FONT_SIZE, font: FONT_NAME })] })],
          }),
        ],
      })
    ),
  });
}

// ── Key-Value Table ────────────────────────────────────────────────────────
// rows = [[key, value], ...]
function keyValueTable(rows, theme) {
  const t = THEMES[theme] || THEMES.blue;
  const headerRow = new TableRow({
    children: [
      new TableCell({
        borders: allB(thickB(t.primary)),
        width: { size: 3000, type: WidthType.DXA },
        shading: { fill: t.primary, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: "Attribute", bold: true, size: FONT_SIZE, font: FONT_NAME, color: "FFFFFF" })] })],
      }),
      new TableCell({
        borders: allB(thickB(t.primary)),
        width: { size: 6360, type: WidthType.DXA },
        shading: { fill: t.primary, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: "Detail", bold: true, size: FONT_SIZE, font: FONT_NAME, color: "FFFFFF" })] })],
      }),
    ],
  });

  const dataRows = rows.map(([k, v], i) =>
    new TableRow({
      children: [
        new TableCell({
          borders: allB(thinB("CCCCCC")),
          width: { size: 3000, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? t.rowEven : t.rowEvenAlt, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: clean(k), bold: true, size: FONT_SIZE, font: FONT_NAME })] })],
        }),
        new TableCell({
          borders: allB(thinB("CCCCCC")),
          width: { size: 6360, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? t.rowOdd : "FFFFFF", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: clean(v), size: FONT_SIZE, font: FONT_NAME })] })],
        }),
      ],
    })
  );

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3000, 6360],
    rows: [headerRow, ...dataRows],
  });
}

// ── TOC ────────────────────────────────────────────────────────────────────
function buildTOC(sections, theme) {
  const t = THEMES[theme] || THEMES.blue;
  const rows = sections.map((sec, i) => {
    const sectionNumber = sec.heading.match(/^\d+/) ? "" : `${i + 1}.   `;
    return new TableRow({
      children: [
        new TableCell({
          borders: {
            top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            bottom: thinB(t.rowEven),
          },
          width: { size: 8200, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: `${sectionNumber}${clean(sec.heading)}`, size: FONT_SIZE, font: FONT_NAME, color: t.secondary })],
            }),
          ],
        }),
        new TableCell({
          borders: {
            top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            bottom: thinB(t.rowEven),
          },
          width: { size: 1160, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "——", size: FONT_SIZE, font: FONT_NAME, color: "BBBBBB" })],
            }),
          ],
        }),
      ],
    });
  });

  return [
    makeH1("Table of Contents", theme),
    spacer(),
    new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [8200, 1160], rows }),
  ];
}

// ── Main Export ────────────────────────────────────────────────────────────
async function generateDocument(payload, outputPath) {
  const {
    title = "Untitled Document",
    sections = [],
    includeTableOfContents = true,
    fontTheme = "blue",
  } = payload;

  const t = THEMES[fontTheme] || THEMES.blue;
  const children = [];

  // 1. Banner
  children.push(chapterBanner(title, `Generated on ${new Date().toLocaleDateString("en-IN")}`, fontTheme));
  children.push(spacer(2));

  // 2. TOC
  if (includeTableOfContents && sections.length > 0) {
    buildTOC(sections, fontTheme).forEach((el) => children.push(el));
    children.push(spacer(3));
  }

  // 3. Sections
  sections.forEach((sec, idx) => {
    const sectionNumber = sec.heading.match(/^\d+/) ? "" : `${idx + 1}.  `;
    children.push(makeH1(`${sectionNumber}${sec.heading}`, fontTheme));
    children.push(spacer());

    // Main content
    if (sec.content) {
      sec.content.split("\n\n").filter(Boolean).forEach((p) => {
        children.push(makePara(p.trim()));
        children.push(spacer(0.6));
      });
    }

    // Info box
    if (sec.infoBox) {
      children.push(spacer());
      children.push(infoBox(sec.infoBoxTitle || null, Array.isArray(sec.infoBox) ? sec.infoBox : [sec.infoBox], fontTheme));
      children.push(spacer());
    }

    // Stat boxes
    if (sec.stats && sec.stats.length > 0) {
      children.push(spacer());
      children.push(statBoxRow(sec.stats, fontTheme));
      children.push(spacer(2));
    }

    // Sub-sections
    if (sec.subSections && sec.subSections.length > 0) {
      sec.subSections.forEach((sub) => {
        children.push(makeH2(sub.heading, fontTheme));
        if (sub.content) {
          sub.content.split("\n\n").filter(Boolean).forEach((p) => {
            children.push(makePara(p.trim()));
            children.push(spacer(0.6));
          });
        }
        if (sub.bullets && sub.bullets.length) {
          sub.bullets.filter(Boolean).forEach((b) => children.push(makeBullet(b)));
          children.push(spacer());
        }
        if (sub.numbered && sub.numbered.length) {
          sub.numbered.filter(Boolean).forEach((n) => children.push(makeNumbered(n)));
          children.push(spacer());
        }
      });
    }

    // Bullets
    if (sec.bullets && sec.bullets.length > 0) {
      children.push(spacer());
      sec.bullets.filter(Boolean).forEach((b) => children.push(makeBullet(b)));
      children.push(spacer());
    }

    // Numbered list
    if (sec.numbered && sec.numbered.length > 0) {
      children.push(spacer());
      sec.numbered.filter(Boolean).forEach((n) => children.push(makeNumbered(n)));
      children.push(spacer());
    }

    // Data table
    if (sec.table && sec.table.length > 1) {
      children.push(spacer());
      children.push(dataTable(sec.table, fontTheme));
      children.push(spacer());
    }

    // Objective table
    if (sec.objectives && sec.objectives.length > 0) {
      children.push(spacer());
      children.push(objectiveTable(sec.objectives, fontTheme));
      children.push(spacer());
    }

    // Key-value table
    if (sec.keyValue && sec.keyValue.length > 0) {
      children.push(spacer());
      children.push(keyValueTable(sec.keyValue, fontTheme));
      children.push(spacer());
    }

    children.push(spacer(2));
  });

  // End marker
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "— End of Document —", size: FONT_SIZE, font: FONT_NAME, color: "888888", italics: true })],
      spacing: { before: 300, after: 200 },
    })
  );

  // ── Assemble Doc ──────────────────────────────────────────────────────────
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "numbers",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    styles: {
      default: { document: { run: { font: FONT_NAME, size: FONT_SIZE, bold: false } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: FONT_SIZE, bold: true, font: FONT_NAME, color: t.primary },
          paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: FONT_SIZE, bold: true, font: FONT_NAME, color: t.secondary },
          paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 },
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: FONT_SIZE, bold: true, font: FONT_NAME, color: t.tertiary },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1080, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: t.secondary, space: 1 } },
              spacing: { before: 0, after: 120 },
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              children: [
                new TextRun({ text: clean(title), size: HF_SIZE, font: FONT_NAME, color: t.secondary }),
                new TextRun({ text: "\t", size: HF_SIZE, font: FONT_NAME }),
                new TextRun({ text: "DocGen  •  AI-Powered Documents", size: HF_SIZE, font: FONT_NAME, color: "AAAAAA" }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 3, color: t.secondary, space: 1 } },
              spacing: { before: 120, after: 0 },
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              children: [
                new TextRun({ text: `Generated by DocGen  |  ${new Date().toLocaleDateString("en-IN")}`, size: HF_SIZE, font: FONT_NAME, color: "AAAAAA" }),
                new TextRun({ text: "\t", size: HF_SIZE, font: FONT_NAME }),
                new TextRun({ text: "Page ", size: HF_SIZE, font: FONT_NAME, color: "AAAAAA" }),
                PageNumber.CURRENT,
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

module.exports = { generateDocument };