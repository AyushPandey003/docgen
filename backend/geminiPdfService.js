const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const { PDFParse } = require("pdf-parse");
const JSON5 = require("json5");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_CONTEXT_CHARS = 120000;
const MODEL_CANDIDATES = [
  DEFAULT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
];
const DOC_PLAN_SCHEMA = {
  type: SchemaType.OBJECT,
  required: ["title", "fontTheme", "style", "includeTableOfContents", "sections"],
  properties: {
    title: { type: SchemaType.STRING },
    fontTheme: {
      type: SchemaType.STRING,
      enum: ["blue", "green", "purple", "dark"],
    },
    style: {
      type: SchemaType.STRING,
      enum: ["professional", "academic", "minimal"],
    },
    includeTableOfContents: { type: SchemaType.BOOLEAN },
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        required: ["heading", "content"],
        properties: {
          heading: { type: SchemaType.STRING },
          content: { type: SchemaType.STRING },
          bullets: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          numbered: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          table: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
          infoBox: { type: SchemaType.STRING },
          infoBoxTitle: { type: SchemaType.STRING },
          stats: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              required: ["label", "value"],
              properties: {
                label: { type: SchemaType.STRING },
                value: { type: SchemaType.STRING },
                color: { type: SchemaType.STRING },
              },
            },
          },
          subSections: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              required: ["heading"],
              properties: {
                heading: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                bullets: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                numbered: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
              },
            },
          },
          objectives: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              required: ["label", "description"],
              properties: {
                label: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING },
              },
            },
          },
          keyValue: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a specialized academic researcher and document professional. Your task is to extract information from a source PDF and generate a highly structured, visually rich document chapter.

CRITICAL FORMATTING RULES:
1. SOURCE FIDELITY: Use ONLY info from the PDF. Mention specific names like "Janawaaz" or "CivicConnect".
2. RICH CONTENT: Use tables for comparisons/data, bullet points for lists, and infoBox for highlights.
3. PLAIN TEXT ONLY: Do NOT use any markdown formatting. No asterisks (**), no hashtags (#), no backticks. Write clean plain text only.
4. SUB-TOPICS: If the user provides sub-topics or a specific structure, follow it EXACTLY. Use the "subSections" property for sub-topics.
5. TABLES: When presenting technology stacks, sampling strategies, or requirement comparisons, use the "table" property (2D string array, first row = headers).
6. NUMBERED LISTS: Use "numbered" array for ordered steps or sequences.
7. KEY-VALUE DATA: Use "keyValue" (array of [key, value] pairs) for attribute-detail tables.
8. OBJECTIVES: Use "objectives" (array of {label, description}) for numbered objectives with descriptions.

JSON Schema Requirements:
- "sections": Each section can have content (paragraphs), bullets (arrays), numbered (arrays), table (2D array), infoBox (string), infoBoxTitle (string), stats (array), subSections (array), objectives (array), and keyValue (2D array).
- subSections follow the same structure: heading, content, bullets, numbered.
- Style: Ensure "academic" is used for formal reports.`;

function getGeminiModel(apiKey, modelName = DEFAULT_MODEL) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("No API key provided. Please add your Gemini API key in the app settings.");
  }

  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });
}

function isModelNotFoundError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 404 || message.includes("is not found") || message.includes("not supported for generatecontent");
}

function uniqueModelList(modelName) {
  const ordered = [modelName, ...MODEL_CANDIDATES].filter(Boolean);
  return [...new Set(ordered)];
}

async function runWithModelFallback(task, preferredModel, apiKey) {
  const modelsToTry = uniqueModelList(preferredModel);
  let lastError;

  for (const currentModel of modelsToTry) {
    try {
      const model = getGeminiModel(apiKey, currentModel);
      const result = await task(model);
      return { result, usedModel: currentModel };
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No compatible Gemini Flash model available.");
}

function parseModelJson(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini returned empty response text.");
  }

  const withoutFences = rawText.replace(/```json|```/gi, "").trim();
  const candidates = [withoutFences];

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  const normalizedTrailingCommas = withoutFences
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
  candidates.push(normalizedTrailingCommas);

  const seen = new Set();
  const uniqueCandidates = candidates.filter((c) => {
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  for (const candidate of uniqueCandidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON5.parse(candidate);
      } catch {
      }
    }
  }

  throw new Error("Could not parse valid JSON from Gemini response.");
}

async function repairToStrictJson({ model, rawText }) {
  const repairPrompt =
    "Convert the following content into STRICT valid JSON object only. " +
    "No markdown fences, no explanation, no extra text. Preserve original meaning and schema.\n\n" +
    rawText;

  const repairResult = await model.generateContent({
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DOC_PLAN_SCHEMA,
      temperature: 0,
    },
    contents: [
      {
        role: "user",
        parts: [{ text: repairPrompt }],
      },
    ],
  });

  return repairResult.response.text();
}

function normalizePlan(plan, fallback = {}) {
  const safeSections = Array.isArray(plan?.sections) ? plan.sections : [];
  const normalizedSections = safeSections
    .map((section) => {
      const base = {
        heading: String(section?.heading || "Untitled Section").trim(),
        content: String(section?.content || "").trim(),
      };
      if (Array.isArray(section?.bullets) && section.bullets.length) {
        base.bullets = section.bullets.map((s) => String(s || "").trim()).filter(Boolean);
      }
      if (Array.isArray(section?.numbered) && section.numbered.length) {
        base.numbered = section.numbered.map((s) => String(s || "").trim()).filter(Boolean);
      }
      if (Array.isArray(section?.table) && section.table.length) {
        base.table = section.table;
      }
      if (section?.infoBox) {
        base.infoBox = section.infoBox;
      }
      if (section?.infoBoxTitle) {
        base.infoBoxTitle = String(section.infoBoxTitle).trim();
      }
      if (Array.isArray(section?.stats) && section.stats.length) {
        base.stats = section.stats;
      }
      if (Array.isArray(section?.subSections) && section.subSections.length) {
        base.subSections = section.subSections.map((sub) => ({
          heading: String(sub?.heading || "").trim(),
          content: String(sub?.content || "").trim(),
          bullets: Array.isArray(sub?.bullets)
            ? sub.bullets.map((s) => String(s || "").trim()).filter(Boolean)
            : undefined,
          numbered: Array.isArray(sub?.numbered)
            ? sub.numbered.map((s) => String(s || "").trim()).filter(Boolean)
            : undefined,
        }));
      }
      if (Array.isArray(section?.objectives) && section.objectives.length) {
        base.objectives = section.objectives;
      }
      if (Array.isArray(section?.keyValue) && section.keyValue.length) {
        base.keyValue = section.keyValue;
      }
      return base;
    })
    .filter((section) => section.heading);

  if (!normalizedSections.length) {
    throw new Error("Gemini response did not include valid sections.");
  }

  const allowedThemes = new Set(["blue", "green", "purple", "dark"]);
  const allowedStyles = new Set(["professional", "academic", "minimal"]);

  const fontTheme = allowedThemes.has(plan?.fontTheme) ? plan.fontTheme : (fallback.fontTheme || "blue");
  const style = allowedStyles.has(plan?.style) ? plan.style : (fallback.style || "academic");

  return {
    title: String(plan?.title || fallback.title || "Generated Chapter").trim(),
    fontTheme,
    style,
    includeTableOfContents:
      typeof plan?.includeTableOfContents === "boolean"
        ? plan.includeTableOfContents
        : (typeof fallback.includeTableOfContents === "boolean" ? fallback.includeTableOfContents : true),
    sections: normalizedSections,
  };
}

async function extractPdfText(pdfAbsolutePath) {
  const pdfBuffer = fs.readFileSync(pdfAbsolutePath);
  const parser = new PDFParse({ data: pdfBuffer });

  try {
    const parsed = await parser.getText();
    return String(parsed?.text || "");
  } finally {
    await parser.destroy();
  }
}

async function generateWithDirectPdf({ model, pdfAbsolutePath, userInstruction }) {
  const pdfBase64 = fs.readFileSync(pdfAbsolutePath).toString("base64");

  const result = await model.generateContent({
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DOC_PLAN_SCHEMA,
      temperature: 0.2,
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `${userInstruction}\n\n` +
              "Use the attached PDF as the primary source context.",
          },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
        ],
      },
    ],
  });

  return result.response.text();
}

async function generateWithExtractedText({ model, pdfAbsolutePath, userInstruction }) {
  const rawText = await extractPdfText(pdfAbsolutePath);
  const trimmedContext = rawText.slice(0, MAX_CONTEXT_CHARS);

  const result = await model.generateContent({
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DOC_PLAN_SCHEMA,
      temperature: 0.2,
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `${userInstruction}\n\n` +
              `PDF_EXTRACTED_CONTEXT_START\n${trimmedContext}\nPDF_EXTRACTED_CONTEXT_END`,
          },
        ],
      },
    ],
  });

  return result.response.text();
}

function resolvePdfPath(pdfPath) {
  if (!pdfPath || typeof pdfPath !== "string") {
    throw new Error("pdfPath is required.");
  }

  const absolutePath = path.isAbsolute(pdfPath)
    ? pdfPath
    : path.resolve(process.cwd(), pdfPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`PDF not found at path: ${absolutePath}`);
  }

  return absolutePath;
}

async function generateDocPlanFromPdfContext({
  pdfPath,
  request,
  chapterLabel,
  title,
  style,
  fontTheme,
  includeTableOfContents,
  generationMode = "auto",
  modelName,
  apiKey,
}) {
  const mode = generationMode || "auto";
  const pdfAbsolutePath = resolvePdfPath(pdfPath);

  const instruction =
    `ACT AS A SENIOR RESEARCHER. Read the attached PDF carefully. ` +
    `Generate a DEEP and DETAILED ${chapterLabel || "chapter"} based ON THE PDF CONTENT. ` +
    `Specific Instructions: ${request || "Synthesize a literature review citing specific papers, findings, and data points found in the PDF."} ` +
    `DO NOT use outside information. If the PDF discusses "Janawaaz" or specific Indian e-governance case studies, ensure those specific details are the core of the content. ` +
    "Return JSON only in the required schema.";

  let rawResponse;
  let usedMode = mode;

  let usedModel = modelName || DEFAULT_MODEL;

  if (mode === "direct_pdf") {
    const { result, usedModel: resolvedModel } = await runWithModelFallback(
      (model) => generateWithDirectPdf({ model, pdfAbsolutePath, userInstruction: instruction }),
      modelName,
      apiKey
    );
    rawResponse = result;
    usedModel = resolvedModel;
  } else if (mode === "extracted_text") {
    const { result, usedModel: resolvedModel } = await runWithModelFallback(
      (model) => generateWithExtractedText({ model, pdfAbsolutePath, userInstruction: instruction }),
      modelName,
      apiKey
    );
    rawResponse = result;
    usedModel = resolvedModel;
  } else {
    try {
      const { result, usedModel: resolvedModel } = await runWithModelFallback(
        (model) => generateWithDirectPdf({ model, pdfAbsolutePath, userInstruction: instruction }),
        modelName,
        apiKey
      );
      rawResponse = result;
      usedModel = resolvedModel;
      usedMode = "direct_pdf";
    } catch {
      const { result, usedModel: resolvedModel } = await runWithModelFallback(
        (model) => generateWithExtractedText({ model, pdfAbsolutePath, userInstruction: instruction }),
        modelName,
        apiKey
      );
      rawResponse = result;
      usedModel = resolvedModel;
      usedMode = "extracted_text";
    }
  }

  let parsed;
  try {
    parsed = parseModelJson(rawResponse);
  } catch {
    const repairModel = getGeminiModel(apiKey, usedModel);
    const repairedRaw = await repairToStrictJson({ model: repairModel, rawText: rawResponse });
    parsed = parseModelJson(repairedRaw);
  }
  const normalized = normalizePlan(parsed, { title, style, fontTheme, includeTableOfContents });

  return { plan: normalized, usedMode, usedModel };
}

module.exports = { generateDocPlanFromPdfContext };
