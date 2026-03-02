/**
 * agent.js — Gemini-powered document design agent.
 *
 * Instead of a rigid schema, the agent freely composes from the block
 * library defined in docEngine.js.  It reasons about content layout,
 * chooses the right visual components, and outputs a block plan.
 */

const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const JSON5 = require("json5");
const { AVAILABLE_BLOCKS } = require("./docEngine");

// ── Config ─────────────────────────────────────────────────────────────────
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_CONTEXT_CHARS = 120_000;
const MODEL_CANDIDATES = [
  DEFAULT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
];

// ── System Prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt() {
  const blockDocs = AVAILABLE_BLOCKS
    .map(b => `  • ${b.type} — ${b.desc}`)
    .join("\n");

  return `You are an expert document designer and content architect.  You create visually stunning, professionally formatted documents by composing an ordered array of visual BLOCKS.

═══ AVAILABLE BLOCK TYPES ═══
${blockDocs}

═══ DESIGN PRINCIPLES (follow strictly) ═══
1. Always START with a "banner" block.
2. Follow the banner with a "toc" block for documents with 3+ sections.
3. Use "heading" blocks (level 1) for major sections.  Use level 2/3 for sub-sections.
4. NEVER dump everything as paragraphs — mix content types.  Alternate text with visual blocks.
5. Use "layerCards" for architecture overviews, component descriptions, or any layered/tiered concepts.
6. Use "statCards" to highlight 3-5 key metrics or numbers.
7. Use "table" for structured comparisons, tech stacks, feature lists.
8. Use "infoBox" to call out important definitions or key takeaways.
9. Use "callout" (variant: tip/warning/note) for practical advice or warnings.
10. Use "keyValueTable" for attribute-detail pairs (project metadata, specs).
11. Use "timeline" for processes, workflows, or sequential steps.
12. Use "objectiveTable" for numbered research objectives, goals, or requirements.
13. Use "summaryBox" at the end of each major topic section — this is CRITICAL for professional docs.
14. Use "quote" for notable citations or key statements.
15. Use "divider" between major topic transitions for visual breathing room.
16. Create visual RHYTHM — after 2-3 text blocks, insert a visual element (table, cards, box).
17. Be GENEROUS with content — write substantive paragraphs, not short fragments.
18. PLAIN TEXT ONLY in all block content — no markdown (**bold**, #heading, etc).
19. Each heading at level 1 should usually be followed by at least a paragraph, then one or more visual blocks.

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON object:
{
  "theme": "blue",
  "title": "Document Title",
  "blocks": [
    { "type": "banner", "label": "CHAPTER 1", "title": "...", "subtitle": "..." },
    { "type": "toc" },
    { "type": "heading", "level": 1, "text": "..." },
    { "type": "paragraph", "text": "..." },
    ...more blocks...
  ]
}

theme must be one of: blue, green, purple, dark.
color properties (in statCards/layerCards) MUST be 6-digit hex codes (e.g. "2E75B6"), NOT named colors.
Return ONLY the JSON, nothing else.`;
}

// ── Gemini Client ──────────────────────────────────────────────────────────
function createModel(modelName = DEFAULT_MODEL) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing in backend .env");
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemPrompt(),
  });
}

function isModelNotFound(err) {
  const m = String(err?.message || "").toLowerCase();
  return err?.status === 404 || m.includes("is not found") || m.includes("not supported");
}

async function callWithFallback(task, preferred) {
  const models = [...new Set([preferred, ...MODEL_CANDIDATES].filter(Boolean))];
  let lastErr;
  for (const name of models) {
    try {
      const model = createModel(name);
      return { result: await task(model), usedModel: name };
    } catch (e) {
      lastErr = e;
      if (!isModelNotFound(e)) throw e;
    }
  }
  throw lastErr || new Error("No compatible model found.");
}

// ── JSON Parsing ───────────────────────────────────────────────────────────
function parseAgentJson(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Empty agent response.");
  const stripped = raw.replace(/```json|```/gi, "").trim();

  const candidates = [stripped];
  const first = stripped.indexOf("{"), last = stripped.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(stripped.slice(first, last + 1));
  candidates.push(stripped.replace(/,\s*([}\]])/g, "$1"));

  for (const c of [...new Set(candidates)]) {
    try { return JSON.parse(c); } catch { /* fallthrough */ }
    try { return JSON5.parse(c); } catch { /* fallthrough */ }
  }
  throw new Error("Failed to parse agent JSON.");
}

// ── Plan Validation ────────────────────────────────────────────────────────
const VALID_TYPES = new Set(AVAILABLE_BLOCKS.map(b => b.type));

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.blocks)) {
    throw new Error("Agent response missing 'blocks' array.");
  }
  const validThemes = new Set(["blue", "green", "purple", "dark"]);
  plan.theme = validThemes.has(plan.theme) ? plan.theme : "blue";
  plan.title = String(plan.title || "Document").trim();

  // Filter to only valid block types and ensure basic structure
  plan.blocks = plan.blocks.filter(b => {
    if (!b || !VALID_TYPES.has(b.type)) {
      console.warn(`Filtered unknown block type: ${b?.type}`);
      return false;
    }
    return true;
  });

  if (!plan.blocks.length) throw new Error("No valid blocks in agent response.");
  return plan;
}

// ── Agent Core ─────────────────────────────────────────────────────────────

/**
 * Run the agent with a text prompt (no PDF).
 */
async function runAgentWithPrompt({ prompt, theme, modelName }) {
  const userMessage =
    `Create a beautifully designed document based on this request:\n\n${prompt}` +
    (theme ? `\n\nPreferred theme: ${theme}` : "");

  const { result, usedModel } = await callWithFallback(async (model) => {
    const res = await model.generateContent({
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    });
    return res.response.text();
  }, modelName || DEFAULT_MODEL);

  let plan;
  try {
    plan = parseAgentJson(result);
  } catch {
    // Repair attempt
    const repair = createModel(usedModel);
    const repairRes = await repair.generateContent({
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
      contents: [{ role: "user", parts: [{ text: "Fix this into valid JSON, keep the same content:\n\n" + result }] }],
    });
    plan = parseAgentJson(repairRes.response.text());
  }

  return { plan: validatePlan(plan), usedModel };
}

/**
 * Run the agent with a PDF file as context.
 */
async function runAgentWithPdf({ pdfPath, prompt, theme, modelName }) {
  const absPath = path.isAbsolute(pdfPath) ? pdfPath : path.resolve(process.cwd(), pdfPath);
  if (!fs.existsSync(absPath)) throw new Error(`PDF not found: ${absPath}`);

  const pdfBase64 = fs.readFileSync(absPath).toString("base64");

  const userMessage =
    `Analyze the attached PDF carefully and create a beautifully designed document.\n\n` +
    `Instructions: ${prompt || "Create a comprehensive, visually rich chapter based on the PDF content. Use specific names, data, and details from the PDF."}` +
    (theme ? `\n\nPreferred theme: ${theme}` : "");

  const { result, usedModel } = await callWithFallback(async (model) => {
    const res = await model.generateContent({
      generationConfig: { responseMimeType: "application/json", temperature: 0.25 },
      contents: [{
        role: "user",
        parts: [
          { text: userMessage },
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
        ],
      }],
    });
    return res.response.text();
  }, modelName || DEFAULT_MODEL);

  let plan;
  try {
    plan = parseAgentJson(result);
  } catch {
    const repair = createModel(usedModel);
    const repairRes = await repair.generateContent({
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
      contents: [{ role: "user", parts: [{ text: "Fix this into valid JSON, keep the same content:\n\n" + result }] }],
    });
    plan = parseAgentJson(repairRes.response.text());
  }

  return { plan: validatePlan(plan), usedModel };
}

/**
 * Run the agent with extracted text (fallback when direct PDF fails).
 */
async function runAgentWithText({ text, prompt, theme, modelName }) {
  const trimmed = text.slice(0, MAX_CONTEXT_CHARS);

  const userMessage =
    `Based on the following source text, create a beautifully designed document.\n\n` +
    `Instructions: ${prompt || "Create a comprehensive, visually rich chapter."}\n\n` +
    (theme ? `Preferred theme: ${theme}\n\n` : "") +
    `SOURCE_TEXT_START\n${trimmed}\nSOURCE_TEXT_END`;

  const { result, usedModel } = await callWithFallback(async (model) => {
    const res = await model.generateContent({
      generationConfig: { responseMimeType: "application/json", temperature: 0.25 },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    });
    return res.response.text();
  }, modelName || DEFAULT_MODEL);

  let plan;
  try {
    plan = parseAgentJson(result);
  } catch {
    const repair = createModel(usedModel);
    const repairRes = await repair.generateContent({
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
      contents: [{ role: "user", parts: [{ text: "Fix this into valid JSON, keep the same content:\n\n" + result }] }],
    });
    plan = parseAgentJson(repairRes.response.text());
  }

  return { plan: validatePlan(plan), usedModel };
}

module.exports = { runAgentWithPrompt, runAgentWithPdf, runAgentWithText };
