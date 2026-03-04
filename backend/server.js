require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");

const { renderDocument, AVAILABLE_BLOCKS } = require("./docEngine");
const { runAgentWithPrompt, runAgentWithPdf } = require("./agent");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Directories
const OUTPUT_DIR = path.join(__dirname, "outputs");
const UPLOAD_DIR = path.join(__dirname, "uploads");
[OUTPUT_DIR, UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// Multer for PDF uploads
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  },
});

// ── Routes ─────────────────────────────────────────────────────────────────

/** Health check */
app.get("/api/health", (_, res) => {
  res.json({ status: "ok", blocks: AVAILABLE_BLOCKS.length });
});

/** List available block types */
app.get("/api/blocks", (_, res) => {
  res.json({ blocks: AVAILABLE_BLOCKS });
});

/**
 * POST /api/generate
 * Body: { prompt: string, theme?: string }
 */
app.post("/api/generate", async (req, res) => {
  const start = Date.now();
  try {
    const apiKey = req.headers["x-api-key"];
    const { prompt, theme } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt is required." });

    const { plan, usedModel } = await runAgentWithPrompt({ prompt, theme, apiKey });

    const filename = `doc_${Date.now()}.docx`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await renderDocument(plan, filepath);

    const safeTitle = (plan.title || "Document").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    res.setHeader("X-Model", usedModel || "unknown");
    res.setHeader("X-Block-Count", String(plan.blocks.length));
    res.setHeader("X-Time-Ms", String(Date.now() - start));
    res.download(filepath, `${safeTitle}.docx`, () => {
      fs.unlink(filepath, () => {});
    });
  } catch (err) {
    console.error("Generate error:", err.message);
    const status = err.message.includes("No API key") ? 401 : 500;
    res.status(status).json({ error: err.message || "Generation failed." });
  }
});

/**
 * POST /api/generate-from-pdf
 * Multipart: file (PDF), prompt?, theme?
 */
app.post("/api/generate-from-pdf", upload.single("file"), async (req, res) => {
  const start = Date.now();
  let uploadedPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "PDF file is required." });

    const apiKey = req.headers["x-api-key"];
    const { prompt, theme } = req.body;

    const { plan, usedModel } = await runAgentWithPdf({
      pdfPath: uploadedPath,
      prompt,
      theme,
      apiKey,
    });

    const filename = `pdf_${Date.now()}.docx`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await renderDocument(plan, filepath);

    const safeTitle = (plan.title || "Document").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    res.setHeader("X-Model", usedModel || "unknown");
    res.setHeader("X-Block-Count", String(plan.blocks.length));
    res.setHeader("X-Time-Ms", String(Date.now() - start));
    res.download(filepath, `${safeTitle}.docx`, () => {
      fs.unlink(filepath, () => {});
      if (uploadedPath) fs.unlink(uploadedPath, () => {});
    });
  } catch (err) {
    console.error("PDF generate error:", err.message);
    if (uploadedPath) fs.unlink(uploadedPath, () => {});
    const status = err.message.includes("No API key") ? 401 : 500;
    res.status(status).json({ error: err.message || "PDF generation failed." });
  }
});

/**
 * POST /api/render
 * Body: { plan: { theme, title, blocks: [...] } }
 * Directly render a block plan (bypass agent).
 */
app.post("/api/render", async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !Array.isArray(plan.blocks)) {
      return res.status(400).json({ error: "plan with blocks[] is required." });
    }

    const filename = `render_${Date.now()}.docx`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await renderDocument(plan, filepath);

    const safeTitle = (plan.title || "Document").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    res.download(filepath, `${safeTitle}.docx`, () => {
      fs.unlink(filepath, () => {});
    });
  } catch (err) {
    console.error("Render error:", err);
    res.status(500).json({ error: "Render failed.", details: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────

/**
 * POST /api/validate-key
 * Body: { apiKey: string }
 * Lightweight Gemini call to verify key validity.
 */
app.post("/api/validate-key", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ valid: false, error: "API key is required." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Reply with OK" }] }],
      generationConfig: { maxOutputTokens: 5 },
    });

    res.json({ valid: true });
  } catch (err) {
    const msg = String(err.message || "").toLowerCase();
    if (msg.includes("api key") || msg.includes("unauthorized") || msg.includes("invalid")) {
      return res.status(401).json({ valid: false, error: "Invalid API key." });
    }
    res.status(500).json({ valid: false, error: "Validation failed. Please try again." });
  }
});
app.listen(PORT, () => {
  console.log(`\n  ✦  DocGen Agent running → http://localhost:${PORT}\n`);
});
