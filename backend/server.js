require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");

const { renderDocument, AVAILABLE_BLOCKS } = require("./docEngine");
const { runAgentWithPrompt, runAgentWithPdf } = require("./agent");

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
    const { prompt, theme } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt is required." });

    const { plan, usedModel } = await runAgentWithPrompt({ prompt, theme });

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
    console.error("Generate error:", err);
    res.status(500).json({ error: "Generation failed.", details: err.message });
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

    const { prompt, theme } = req.body;

    const { plan, usedModel } = await runAgentWithPdf({
      pdfPath: uploadedPath,
      prompt,
      theme,
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
    console.error("PDF generate error:", err);
    if (uploadedPath) fs.unlink(uploadedPath, () => {});
    res.status(500).json({ error: "PDF generation failed.", details: err.message });
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
app.listen(PORT, () => {
  console.log(`\n  ✦  DocGen Agent running → http://localhost:${PORT}\n`);
});
