/**
 * docEngine.js — Block-based DOCX rendering engine.
 *
 * The AI agent composes a document from an ordered array of "blocks".
 * Each block has a `type` and type-specific props.  This engine renders
 * every block type into beautiful docx elements.
 *
 * Supported block types:
 *   banner, toc, heading, paragraph, bulletList, numberedList,
 *   table, infoBox, callout, statCards, layerCards, keyValueTable,
 *   objectiveTable, timeline, summaryBox, quote, divider, spacer, pageBreak
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Header, Footer, PageNumber, TabStopType, TabStopPosition,
  PageBreak,
} = require("docx");
const fs = require("fs");

// ── Fonts & Sizes (half-points) ────────────────────────────────────────────
const DISPLAY = "Calibri";
const BODY    = "Times New Roman";

const SZ = {
  bannerLabel: 22, bannerTitle: 52, bannerSub: 22,
  h1: 36, h2: 30, h3: 26,
  body: 24, bullet: 24,
  tHead: 22, tBody: 22,
  small: 20, hf: 18,
  cardTag: 22, cardTitle: 24, cardSub: 20, cardBody: 22,
  infoTitle: 26, infoBody: 24,
  statVal: 30, statLabel: 20,
  summaryTitle: 28, summaryBody: 24,
  quoteText: 26, quoteAttr: 20,
  calloutTitle: 24, calloutBody: 22,
  tocEntry: 24,
};

// ── Theme Palettes ─────────────────────────────────────────────────────────
const THEMES = {
  blue:   { primary:"1F3864", secondary:"2E75B6", tertiary:"2F5496", accent:"A8C5E8", light:"EBF3FB", rowA:"D6E4F0", rowB:"F8FBFD", bannerSub:"C5D9F1" },
  green:  { primary:"1A3C2E", secondary:"2D7A50", tertiary:"1E5C3A", accent:"A8D5B5", light:"EAF5EE", rowA:"D0EAD8", rowB:"F5FBF7", bannerSub:"B2DFBD" },
  purple: { primary:"2D1B5E", secondary:"6B42C8", tertiary:"4A2D9C", accent:"C5B3F0", light:"F0EAFD", rowA:"DDD3F7", rowB:"FAF7FF", bannerSub:"D4C6F5" },
  dark:   { primary:"111827", secondary:"374151", tertiary:"1F2937", accent:"9CA3AF", light:"F3F4F6", rowA:"E5E7EB", rowB:"F9FAFB", bannerSub:"D1D5DB" },
};

const CALLOUT_COLORS = {
  info:    { bg: "EBF3FB", border: "2E75B6", icon: "\u2139\uFE0F" },
  tip:     { bg: "EAF5EE", border: "2D7A50", icon: "\uD83D\uDCA1"  },
  warning: { bg: "FFF8E1", border: "F59E0B", icon: "\u26A0\uFE0F"  },
  note:    { bg: "F0EAFD", border: "6B42C8", icon: "\uD83D\uDCDD"  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function normalizeHex(color) {
  if (!color) return null;
  const named = {
    blue: "2E75B6", red: "C0504D", green: "375623",
    purple: "7030A0", yellow: "BF8F00", black: "000000", white: "FFFFFF",
    gray: "888888", grey: "888888", orange: "ED7D31"
  };
  const c = String(color).toLowerCase().replace("#", "").trim();
  if (named[c]) return named[c];
  if (/^[0-9A-F]{6}$/i.test(c)) return c;
  return null;
}

function clean(t) {
  if (!t) return "";
  return String(t)
    .replace(/\*\*\*(.*?)\*\*\*/g,"$1").replace(/\*\*(.*?)\*\*/g,"$1")
    .replace(/\*(.*?)\*/g,"$1").replace(/__(.*?)__/g,"$1")
    .replace(/_(.*?)_/g,"$1").replace(/^#+\s*/gm,"")
    .replace(/`(.*?)`/g,"$1").trim();
}

function thinB(c="CCCCCC"){ return {style:BorderStyle.SINGLE,size:1,color:c}; }
function thickB(c){ return {style:BorderStyle.SINGLE,size:3,color:c}; }
function allB(b){ return {top:b,bottom:b,left:b,right:b}; }
function noneB(){ const n={style:BorderStyle.NONE,size:0,color:"FFFFFF"}; return {top:n,bottom:n,left:n,right:n}; }

function spc(lines=1){
  return new Paragraph({ children:[new TextRun({text:"",size:SZ.body,font:BODY})], spacing:{before:0,after:lines*120} });
}

// ── Block Renderers ────────────────────────────────────────────────────────
// Each returns an array of docx paragraphs/tables.

function renderBanner(block, T) {
  const label = clean(block.label || "GENERATED DOCUMENT");
  const title = clean(block.title || "Untitled");
  const subtitle = clean(block.subtitle || "");
  return [
    new Table({
      width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
      rows:[new TableRow({children:[new TableCell({
        borders:noneB(), width:{size:9360,type:WidthType.DXA},
        shading:{fill:T.primary,type:ShadingType.CLEAR},
        margins:{top:400,bottom:400,left:500,right:500},
        children:[
          new Paragraph({ alignment:AlignmentType.LEFT, spacing:{after:140},
            children:[new TextRun({text:label.toUpperCase(),size:SZ.bannerLabel,font:DISPLAY,color:T.accent,bold:true,characterSpacing:140})] }),
          new Paragraph({ alignment:AlignmentType.LEFT, spacing:{after:120},
            children:[new TextRun({text:title,size:SZ.bannerTitle,font:DISPLAY,color:"FFFFFF",bold:true})] }),
          ...(subtitle ? [new Paragraph({ alignment:AlignmentType.LEFT,
            children:[new TextRun({text:subtitle,size:SZ.bannerSub,font:DISPLAY,color:T.bannerSub,italics:true})] })] : []),
        ],
      })]})]
    }),
    spc(2),
  ];
}

function renderHeading(block, T) {
  const text = clean(block.text || "");
  const level = block.level || 1;
  if (level === 1) {
    return [new Paragraph({
      spacing:{before:480,after:240},
      border:{bottom:{style:BorderStyle.SINGLE,size:8,color:T.primary,space:4}},
      children:[new TextRun({text, bold:true, size:SZ.h1, font:DISPLAY, color:T.primary})],
    })];
  }
  if (level === 2) {
    return [new Paragraph({
      spacing:{before:360,after:160},
      children:[new TextRun({text, bold:true, size:SZ.h2, font:DISPLAY, color:T.secondary})],
    })];
  }
  return [new Paragraph({
    spacing:{before:260,after:120},
    children:[new TextRun({text, bold:true, size:SZ.h3, font:DISPLAY, color:T.tertiary})],
  })];
}

function renderParagraph(block, T) {
  const parts = clean(block.text || "").split(/\n\n+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    out.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before:80, after:80, line:360 },
      children: [new TextRun({ text:p, size:SZ.body, font:BODY, color:"333333" })],
    }));
  }
  return out;
}

function renderBulletList(block) {
  return (block.items || []).filter(Boolean).map(item =>
    new Paragraph({
      numbering:{reference:"bullets",level:0},
      spacing:{before:60,after:60,line:320},
      children:[new TextRun({text:clean(item),size:SZ.bullet,font:BODY,color:"333333"})],
    })
  );
}

function renderNumberedList(block) {
  return (block.items || []).filter(Boolean).map(item =>
    new Paragraph({
      numbering:{reference:"numbers",level:0},
      spacing:{before:60,after:60,line:320},
      children:[new TextRun({text:clean(item),size:SZ.bullet,font:BODY,color:"333333"})],
    })
  );
}

function renderTable(block, T) {
  const headers = block.headers || [];
  const rows    = block.rows    || [];
  if (!headers.length) return [];
  const colCount = headers.length;
  const colW = Math.floor(9360/colCount);

  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      borders:allB(thickB(T.primary)), width:{size:colW,type:WidthType.DXA},
      shading:{fill:T.primary,type:ShadingType.CLEAR},
      margins:{top:100,bottom:100,left:140,right:140},
      children:[new Paragraph({children:[new TextRun({text:clean(h),bold:true,size:SZ.tHead,font:DISPLAY,color:"FFFFFF"})]})],
    })),
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: (Array.isArray(row)?row:[]).map(cell => new TableCell({
      borders:allB(thinB("CCCCCC")), width:{size:colW,type:WidthType.DXA},
      shading:{fill: ri%2===0 ? T.rowA : T.rowB, type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:140,right:140},
      children:[new Paragraph({children:[new TextRun({text:clean(cell),size:SZ.tBody,font:BODY})]})],
    })),
  }));

  const elems = [];
  if (block.caption) {
    elems.push(new Paragraph({
      spacing:{before:60,after:100},
      children:[new TextRun({text:clean(block.caption),bold:true,size:SZ.small,font:DISPLAY,color:T.secondary,italics:true})],
    }));
  }
  elems.push(new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:Array(colCount).fill(colW), rows:[headerRow,...dataRows] }));
  return elems;
}

function renderInfoBox(block, T) {
  const title   = clean(block.title || "");
  const content = clean(block.content || "");
  const lines   = content.split(/\n+/).filter(Boolean);

  return [new Table({
    width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    rows:[new TableRow({children:[new TableCell({
      borders:{
        left:{style:BorderStyle.SINGLE,size:14,color:T.secondary},
        top:thinB(T.secondary), bottom:thinB(T.secondary), right:thinB(T.secondary),
      },
      width:{size:9360,type:WidthType.DXA},
      shading:{fill:T.light,type:ShadingType.CLEAR},
      margins:{top:180,bottom:180,left:300,right:220},
      children:[
        ...(title ? [new Paragraph({
          spacing:{after:100},
          children:[new TextRun({text:title,bold:true,size:SZ.infoTitle,font:DISPLAY,color:T.primary})],
        })] : []),
        ...lines.map(l => new Paragraph({
          spacing:{before:40,after:40,line:340},
          children:[new TextRun({text:l,size:SZ.infoBody,font:BODY,color:"333333"})],
        })),
      ],
    })]})]
  })];
}

function renderCallout(block, T) {
  const variant = CALLOUT_COLORS[block.variant] || CALLOUT_COLORS.info;
  const title   = clean(block.title || "");
  const content = clean(block.content || "");

  return [new Table({
    width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    rows:[new TableRow({children:[new TableCell({
      borders:{
        left:{style:BorderStyle.SINGLE,size:16,color:variant.border},
        top:thinB(variant.border), bottom:thinB(variant.border), right:thinB(variant.border),
      },
      width:{size:9360,type:WidthType.DXA},
      shading:{fill:variant.bg,type:ShadingType.CLEAR},
      margins:{top:160,bottom:160,left:280,right:200},
      children:[
        ...(title ? [new Paragraph({
          spacing:{after:80},
          children:[
            new TextRun({text:`${variant.icon}  `,size:SZ.calloutTitle,font:DISPLAY}),
            new TextRun({text:title,bold:true,size:SZ.calloutTitle,font:DISPLAY,color:variant.border}),
          ],
        })] : []),
        new Paragraph({
          spacing:{before:40,after:40,line:340},
          children:[new TextRun({text:content,size:SZ.calloutBody,font:BODY,color:"333333"})],
        }),
      ],
    })]})]
  })];
}

function renderStatCards(block, T) {
  const cards = block.cards || [];
  if (!cards.length) return [];
  const palette = [T.secondary, "C0504D", "7030A0", "375623", "BF8F00", "2E75B6"];
  const GAP = 200;
  const boxW = Math.floor((9360 - GAP*(cards.length-1)) / cards.length);

  const cells = []; const widths = [];
  cards.forEach((c,i) => {
    const color = normalizeHex(c.color) || palette[i%palette.length];
    cells.push(new TableCell({
      borders:allB(thickB(color)), width:{size:boxW,type:WidthType.DXA},
      shading:{fill:color,type:ShadingType.CLEAR},
      margins:{top:180,bottom:180,left:120,right:120},
      children:[
        new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:40},
          children:[new TextRun({text:clean(c.value),bold:true,size:SZ.statVal,font:DISPLAY,color:"FFFFFF"})]}),
        new Paragraph({ alignment:AlignmentType.CENTER,
          children:[new TextRun({text:clean(c.label),size:SZ.statLabel,font:DISPLAY,color:"FFFFFF"})]}),
      ],
    }));
    widths.push(boxW);
    if (i < cards.length-1) {
      cells.push(new TableCell({ borders:noneB(), width:{size:GAP,type:WidthType.DXA},
        children:[new Paragraph({children:[new TextRun({text:"",size:SZ.small,font:BODY})]})] }));
      widths.push(GAP);
    }
  });

  return [new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:widths, rows:[new TableRow({children:cells})] })];
}

function renderLayerCards(block, T) {
  const cards = block.cards || [];
  if (!cards.length) return [];
  const palette = [T.primary, T.secondary, T.tertiary, "C0504D", "BF8F00", "375623"];
  const elems = [];

  cards.forEach((card, i) => {
    const color = normalizeHex(card.color) || palette[i % palette.length];
    const tag = clean(card.tag || `L${i+1}`);
    const title = clean(card.title || "");
    const subtitle = clean(card.subtitle || "");
    const desc = clean(card.description || "");

    const tagCell = new TableCell({
      borders:allB(thickB(color)),
      width:{size:900,type:WidthType.DXA},
      shading:{fill:color,type:ShadingType.CLEAR},
      margins:{top:140,bottom:140,left:60,right:60},
      verticalAlign: "center",
      children:[new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({text:tag,bold:true,size:SZ.cardTag,font:DISPLAY,color:"FFFFFF"})],
      })],
    });

    const contentChildren = [
      new Paragraph({ spacing:{after: subtitle ? 30 : 60}, children:[
        new TextRun({text:title,bold:true,size:SZ.cardTitle,font:DISPLAY,color:"222222"}),
        ...(subtitle ? [
          new TextRun({text:"  "},),
          new TextRun({text:subtitle,size:SZ.cardSub,font:DISPLAY,color:"888888",italics:true}),
        ] : []),
      ]}),
    ];
    if (desc) {
      contentChildren.push(new Paragraph({ spacing:{before:20,after:20,line:320},
        children:[new TextRun({text:desc,size:SZ.cardBody,font:BODY,color:"444444"})],
      }));
    }

    const bodyCell = new TableCell({
      borders:{
        top:thinB("DDDDDD"), bottom:thinB("DDDDDD"), right:thinB("DDDDDD"),
        left:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
      },
      width:{size:8460,type:WidthType.DXA},
      shading:{fill: i%2===0 ? "FAFBFC" : "FFFFFF", type:ShadingType.CLEAR},
      margins:{top:140,bottom:140,left:200,right:160},
      children: contentChildren,
    });

    elems.push(new Table({
      width:{size:9360,type:WidthType.DXA}, columnWidths:[900,8460],
      rows:[new TableRow({children:[tagCell,bodyCell]})],
    }));
    if (i < cards.length-1) elems.push(spc(0.5));
  });

  return elems;
}

function renderKeyValueTable(block, T) {
  const pairs = block.pairs || [];
  if (!pairs.length) return [];

  const kHeader = clean(block.keyHeader || "Attribute");
  const vHeader = clean(block.valueHeader || "Detail");

  const headerRow = new TableRow({ children:[
    new TableCell({ borders:allB(thickB(T.primary)), width:{size:3200,type:WidthType.DXA},
      shading:{fill:T.primary,type:ShadingType.CLEAR}, margins:{top:90,bottom:90,left:140,right:140},
      children:[new Paragraph({children:[new TextRun({text:kHeader,bold:true,size:SZ.tHead,font:DISPLAY,color:"FFFFFF"})]})] }),
    new TableCell({ borders:allB(thickB(T.primary)), width:{size:6160,type:WidthType.DXA},
      shading:{fill:T.primary,type:ShadingType.CLEAR}, margins:{top:90,bottom:90,left:140,right:140},
      children:[new Paragraph({children:[new TextRun({text:vHeader,bold:true,size:SZ.tHead,font:DISPLAY,color:"FFFFFF"})]})] }),
  ]});

  const rows = pairs.map(([k,v],i) => new TableRow({ children:[
    new TableCell({ borders:allB(thinB("CCCCCC")), width:{size:3200,type:WidthType.DXA},
      shading:{fill: i%2===0 ? T.rowA : T.light, type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:140,right:140},
      children:[new Paragraph({children:[new TextRun({text:clean(k),bold:true,size:SZ.tBody,font:BODY})]})] }),
    new TableCell({ borders:allB(thinB("CCCCCC")), width:{size:6160,type:WidthType.DXA},
      shading:{fill: i%2===0 ? T.rowB : "FFFFFF", type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:140,right:140},
      children:[new Paragraph({children:[new TextRun({text:clean(v),size:SZ.tBody,font:BODY})]})] }),
  ]}));

  const elems = [];
  if (block.title) {
    elems.push(new Paragraph({ spacing:{before:60,after:100},
      children:[new TextRun({text:clean(block.title),bold:true,size:SZ.small,font:DISPLAY,color:T.secondary,italics:true})]}));
  }
  elems.push(new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[3200,6160], rows:[headerRow,...rows] }));
  return elems;
}

function renderObjectiveTable(block, T) {
  const items = block.items || [];
  if (!items.length) return [];

  return [new Table({
    width:{size:9360,type:WidthType.DXA}, columnWidths:[1600,7760],
    rows: items.map(({id,title,description},i) => {
      const color = i%2===0 ? T.primary : T.secondary;
      return new TableRow({ children:[
        new TableCell({
          borders:allB(thickB(color)), width:{size:1600,type:WidthType.DXA},
          shading:{fill:color,type:ShadingType.CLEAR}, margins:{top:130,bottom:130,left:80,right:80},
          children:[new Paragraph({ alignment:AlignmentType.CENTER,
            children:[new TextRun({text:clean(id||title||`O${i+1}`),bold:true,size:SZ.tHead,font:DISPLAY,color:"FFFFFF"})]})],
        }),
        new TableCell({
          borders:allB(thinB("CCCCCC")), width:{size:7760,type:WidthType.DXA},
          shading:{fill: i%2===0 ? "F0F5FB" : "FFFFFF", type:ShadingType.CLEAR},
          margins:{top:130,bottom:130,left:180,right:160},
          children:[
            ...(title && description ? [new Paragraph({ spacing:{after:40},
              children:[new TextRun({text:clean(title),bold:true,size:SZ.tBody,font:DISPLAY,color:"222222"})]})] : []),
            new Paragraph({ children:[new TextRun({text:clean(description||title||""),size:SZ.tBody,font:BODY,color:"444444"})] }),
          ],
        }),
      ]});
    }),
  })];
}

function renderTimeline(block, T) {
  const steps = block.steps || [];
  if (!steps.length) return [];

  return [new Table({
    width:{size:9360,type:WidthType.DXA}, columnWidths:[1200,8160],
    rows: steps.map((step,i) => {
      const isLast = i === steps.length-1;
      return new TableRow({ children:[
        new TableCell({
          borders:{
            top:thinB(T.secondary), bottom: isLast ? thinB(T.secondary) : {style:BorderStyle.NONE,size:0,color:"FFFFFF"},
            left:thinB(T.secondary), right:thinB(T.secondary),
          },
          width:{size:1200,type:WidthType.DXA},
          shading:{fill:T.secondary,type:ShadingType.CLEAR}, margins:{top:100,bottom:100,left:60,right:60},
          children:[new Paragraph({ alignment:AlignmentType.CENTER,
            children:[new TextRun({text:`${i+1}`,bold:true,size:SZ.tHead,font:DISPLAY,color:"FFFFFF"})]})],
        }),
        new TableCell({
          borders:allB(thinB("DDDDDD")),
          width:{size:8160,type:WidthType.DXA},
          shading:{fill: i%2===0 ? T.light : "FFFFFF", type:ShadingType.CLEAR},
          margins:{top:100,bottom:100,left:200,right:160},
          children:[
            new Paragraph({ spacing:{after:20},
              children:[new TextRun({text:clean(step.label||step.title||`Step ${i+1}`),bold:true,size:SZ.tBody,font:DISPLAY,color:"222222"})]}),
            ...(step.description ? [new Paragraph({
              children:[new TextRun({text:clean(step.description),size:SZ.tBody,font:BODY,color:"444444"})]})] : []),
          ],
        }),
      ]});
    }),
  })];
}

function renderSummaryBox(block, T) {
  const title   = clean(block.title || "Chapter Summary");
  const content = clean(block.content || "");
  const bullets = (block.bullets || []).filter(Boolean);

  const inner = [];
  inner.push(new Paragraph({ spacing:{after:120},
    children:[new TextRun({text:title,bold:true,size:SZ.summaryTitle,font:DISPLAY,color:"FFFFFF"})]}));
  if (content) {
    inner.push(new Paragraph({ spacing:{before:60,after:60,line:340},
      children:[new TextRun({text:content,size:SZ.summaryBody,font:BODY,color:"E8E8E8"})]}));
  }
  for (const b of bullets) {
    inner.push(new Paragraph({ spacing:{before:40,after:40,line:320},
      children:[
        new TextRun({text:"  \u2022  ",size:SZ.summaryBody,font:DISPLAY,color:T.accent}),
        new TextRun({text:clean(b),size:SZ.summaryBody,font:BODY,color:"E8E8E8"}),
      ]}));
  }

  return [new Table({
    width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    rows:[new TableRow({children:[new TableCell({
      borders:allB(thickB(T.secondary)),
      width:{size:9360,type:WidthType.DXA},
      shading:{fill:T.primary,type:ShadingType.CLEAR},
      margins:{top:240,bottom:240,left:360,right:360},
      children: inner,
    })]})]
  })];
}

function renderQuote(block, T) {
  const text = clean(block.text || "");
  const attr = clean(block.attribution || "");
  return [new Table({
    width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    rows:[new TableRow({children:[new TableCell({
      borders:{
        left:{style:BorderStyle.SINGLE,size:16,color:T.accent},
        top:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
        bottom:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
        right:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
      },
      width:{size:9360,type:WidthType.DXA},
      margins:{top:140,bottom:140,left:320,right:200},
      children:[
        new Paragraph({ spacing:{after: attr?60:0},
          children:[new TextRun({text:`\u201C${text}\u201D`,size:SZ.quoteText,font:BODY,color:"555555",italics:true})]}),
        ...(attr ? [new Paragraph({
          children:[new TextRun({text:`\u2014 ${attr}`,size:SZ.quoteAttr,font:DISPLAY,color:"999999"})]})] : []),
      ],
    })]})]
  })];
}

function renderDivider(block, T) {
  if (block.style === "space") return [spc(2)];
  return [new Paragraph({
    spacing:{before:200,after:200},
    border:{bottom:{style:BorderStyle.SINGLE,size:2,color:T.rowA,space:1}},
    children:[new TextRun({text:"",size:SZ.small,font:BODY})],
  })];
}

function renderSpacer(block) {
  return [spc(block.lines || 1)];
}

function renderPageBreak() {
  return [new Paragraph({ children:[new TextRun({ break: 1 })], pageBreakBefore: true })];
}

function renderTOC(block, allBlocks, T) {
  // Collect headings from the rest of the blocks
  const headings = allBlocks
    .filter(b => b.type === "heading")
    .map(b => ({ text: clean(b.text||""), level: b.level||1 }));
  if (!headings.length) return [];

  const rows = headings.map((h,i) => {
    const indent = h.level === 1 ? "" : h.level === 2 ? "    " : "        ";
    return new TableRow({ children:[
      new TableCell({
        borders:{
          top:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}, left:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
          right:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}, bottom:thinB(T.rowA),
        },
        width:{size:8400,type:WidthType.DXA}, margins:{top:70,bottom:70,left:100,right:60},
        children:[new Paragraph({
          children:[new TextRun({text:`${indent}${h.text}`,size:SZ.tocEntry,font:BODY,color: h.level===1 ? T.primary : T.secondary})],
        })],
      }),
      new TableCell({
        borders:{
          top:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}, left:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
          right:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}, bottom:thinB(T.rowA),
        },
        width:{size:960,type:WidthType.DXA}, margins:{top:70,bottom:70,left:60,right:100},
        children:[new Paragraph({ alignment:AlignmentType.RIGHT,
          children:[new TextRun({text:"——",size:SZ.tocEntry,font:BODY,color:"BBBBBB"})],
        })],
      }),
    ]});
  });

  return [
    new Paragraph({
      spacing:{before:480,after:240},
      border:{bottom:{style:BorderStyle.SINGLE,size:8,color:T.primary,space:4}},
      children:[new TextRun({text:"Table of Contents",bold:true,size:SZ.h1,font:DISPLAY,color:T.primary})],
    }),
    spc(0.5),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[8400,960], rows }),
    spc(2),
  ];
}

// ── Master Block Router ────────────────────────────────────────────────────

function renderBlock(block, theme, allBlocks) {
  const T = THEMES[theme] || THEMES.blue;
  switch (block.type) {
    case "banner":         return renderBanner(block, T);
    case "toc":            return renderTOC(block, allBlocks, T);
    case "heading":        return renderHeading(block, T);
    case "paragraph":      return renderParagraph(block, T);
    case "bulletList":     return renderBulletList(block);
    case "numberedList":   return renderNumberedList(block);
    case "table":          return renderTable(block, T);
    case "infoBox":        return renderInfoBox(block, T);
    case "callout":        return renderCallout(block, T);
    case "statCards":      return renderStatCards(block, T);
    case "layerCards":     return renderLayerCards(block, T);
    case "keyValueTable":  return renderKeyValueTable(block, T);
    case "objectiveTable": return renderObjectiveTable(block, T);
    case "timeline":       return renderTimeline(block, T);
    case "summaryBox":     return renderSummaryBox(block, T);
    case "quote":          return renderQuote(block, T);
    case "divider":        return renderDivider(block, T);
    case "spacer":         return renderSpacer(block);
    case "pageBreak":      return renderPageBreak();
    default:
      console.warn(`Unknown block type: ${block.type}`);
      return [];
  }
}

// ── Document Assembly ──────────────────────────────────────────────────────

async function renderDocument(plan, outputPath) {
  const theme  = plan.theme  || "blue";
  const title  = clean(plan.title  || "Document");
  const blocks = plan.blocks || [];
  const T = THEMES[theme] || THEMES.blue;

  // Render all blocks
  const children = [];
  for (const block of blocks) {
    const elements = renderBlock(block, theme, blocks);
    children.push(...elements);
    // Auto-space between blocks (unless block is spacer/divider/pageBreak)
    if (!["spacer","divider","pageBreak","banner"].includes(block.type)) {
      children.push(spc(0.7));
    }
  }

  // End marker
  children.push(spc(2));
  children.push(new Paragraph({
    alignment:AlignmentType.CENTER, spacing:{before:300,after:200},
    children:[new TextRun({text:"\u2014 End of Document \u2014",size:SZ.body,font:BODY,color:"888888",italics:true})],
  }));

  const doc = new Document({
    numbering: { config: [
      { reference:"bullets", levels:[{ level:0, format:LevelFormat.BULLET, text:"\u2022", alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:720,hanging:360}}} }] },
      { reference:"numbers", levels:[{ level:0, format:LevelFormat.DECIMAL, text:"%1.", alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:720,hanging:360}}} }] },
    ]},
    styles: {
      default:{ document:{ run:{font:BODY,size:SZ.body,bold:false} } },
      paragraphStyles:[
        { id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,
          run:{size:SZ.h1,bold:true,font:DISPLAY,color:T.primary}, paragraph:{spacing:{before:480,after:240},outlineLevel:0} },
        { id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,
          run:{size:SZ.h2,bold:true,font:DISPLAY,color:T.secondary}, paragraph:{spacing:{before:360,after:160},outlineLevel:1} },
        { id:"Heading3",name:"Heading 3",basedOn:"Normal",next:"Normal",quickFormat:true,
          run:{size:SZ.h3,bold:true,font:DISPLAY,color:T.tertiary}, paragraph:{spacing:{before:260,after:120},outlineLevel:2} },
      ],
    },
    sections:[{
      properties:{
        page:{ size:{width:12240,height:15840}, margin:{top:1440,right:1080,bottom:1440,left:1440} },
      },
      headers:{ default: new Header({ children:[
        new Paragraph({
          border:{bottom:{style:BorderStyle.SINGLE,size:3,color:T.secondary,space:1}},
          spacing:{before:0,after:120},
          tabStops:[{type:TabStopType.RIGHT,position:TabStopPosition.MAX}],
          children:[
            new TextRun({text:title,size:SZ.hf,font:DISPLAY,color:T.secondary}),
            new TextRun({text:"\t",size:SZ.hf,font:DISPLAY}),
            new TextRun({text:"DocGen Agent  \u2022  AI-Powered",size:SZ.hf,font:DISPLAY,color:"AAAAAA"}),
          ],
        }),
      ]})},
      footers:{ default: new Footer({ children:[
        new Paragraph({
          border:{top:{style:BorderStyle.SINGLE,size:3,color:T.secondary,space:1}},
          spacing:{before:120,after:0},
          tabStops:[{type:TabStopType.RIGHT,position:TabStopPosition.MAX}],
          children:[
            new TextRun({text:`Generated by DocGen Agent  |  ${new Date().toLocaleDateString("en-IN")}`,size:SZ.hf,font:DISPLAY,color:"AAAAAA"}),
            new TextRun({text:"\t",size:SZ.hf,font:DISPLAY}),
            new TextRun({text:"Page ",size:SZ.hf,font:DISPLAY,color:"AAAAAA"}),
            PageNumber.CURRENT,
          ],
        }),
      ]})},
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ── Exports ────────────────────────────────────────────────────────────────

/** List of all available block types the agent can use */
const AVAILABLE_BLOCKS = [
  { type:"banner",         desc:"Full-width colored title banner. Props: label, title, subtitle" },
  { type:"toc",            desc:"Auto-generated table of contents from headings" },
  { type:"heading",        desc:"Section heading. Props: text, level (1|2|3)" },
  { type:"paragraph",      desc:"Body text paragraph. Props: text (use \\n\\n for multiple paragraphs)" },
  { type:"bulletList",     desc:"Unordered list. Props: items (string array)" },
  { type:"numberedList",   desc:"Ordered list. Props: items (string array)" },
  { type:"table",          desc:"Data table. Props: caption?, headers (string[]), rows (string[][])" },
  { type:"infoBox",        desc:"Highlighted information box with left accent border. Props: title?, content" },
  { type:"callout",        desc:"Attention box. Props: title?, content, variant (info|tip|warning|note)" },
  { type:"statCards",      desc:"Row of colored metric boxes. Props: cards [{value, label, color? (6-hex)}]" },
  { type:"layerCards",     desc:"Architecture layer cards with colored tag + description. Props: cards [{tag, title, subtitle?, description, color? (6-hex)}]" },
  { type:"keyValueTable",  desc:"Attribute-detail pair table. Props: title?, keyHeader?, valueHeader?, pairs [[key,val]]" },
  { type:"objectiveTable", desc:"Numbered objectives with descriptions. Props: items [{id, title, description}]" },
  { type:"timeline",       desc:"Sequential process steps. Props: steps [{label, description}]" },
  { type:"summaryBox",     desc:"Dark colored recap box. Props: title?, content?, bullets? (string[])" },
  { type:"quote",          desc:"Styled blockquote. Props: text, attribution?" },
  { type:"divider",        desc:"Visual separator. Props: style? (line|space)" },
  { type:"spacer",         desc:"Vertical whitespace. Props: lines? (number)" },
  { type:"pageBreak",      desc:"Force a new page" },
];

module.exports = { renderDocument, AVAILABLE_BLOCKS, THEMES };
