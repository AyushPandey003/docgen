import { useState, useRef, useCallback } from "react";
import axios from "axios";
import {
  FileText, Upload, Download, Sparkles, Loader2,
  CheckCircle2, AlertCircle, Palette, Zap, Layers,
  X, ChevronDown,
} from "lucide-react";

// ── Config ─────────────────────────────────────────────────────────────────
const API = "/api";

const THEMES = [
  { id: "blue",   label: "Ocean Blue",    color: "#2E75B6", bg: "#1F3864" },
  { id: "green",  label: "Forest Green",  color: "#2D7A50", bg: "#1A3C2E" },
  { id: "purple", label: "Deep Purple",   color: "#6B42C8", bg: "#2D1B5E" },
  { id: "dark",   label: "Midnight",      color: "#6B7280", bg: "#111827" },
];

const EXAMPLES = [
  "Write a comprehensive chapter on System Architecture for a smart city grievance management platform, including tech stack, microservices breakdown, and data flow diagrams",
  "Create a detailed literature review on AI-powered document generation, covering recent advances, key papers, and research gaps",
  "Generate a project proposal for an IoT-based environmental monitoring system with objectives, methodology, timeline, and expected outcomes",
  "Write Chapter 3: Research Methodology for a study on citizen satisfaction with e-governance platforms in India",
];

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [prompt, setPrompt]     = useState("");
  const [theme, setTheme]       = useState("blue");
  const [pdfFile, setPdfFile]   = useState(null);
  const [status, setStatus]     = useState("idle");       // idle | thinking | rendering | done | error
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult]     = useState(null);          // { url, filename, model, blocks, time }
  const [error, setError]       = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setStatus("idle"); setStatusMsg(""); setResult(null); setError("");
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !pdfFile) return;
    reset();
    setStatus("thinking");
    setStatusMsg("Agent is analyzing your request and designing the document layout...");

    try {
      let response;
      const startTime = Date.now();

      if (pdfFile) {
        // PDF mode
        setStatusMsg("Agent is reading the PDF and planning visual components...");
        const form = new FormData();
        form.append("file", pdfFile);
        if (prompt.trim()) form.append("prompt", prompt.trim());
        form.append("theme", theme);

        response = await axios.post(`${API}/generate-from-pdf`, form, {
          responseType: "blob",
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        // Text prompt mode
        setStatusMsg("Agent is composing blocks and generating content...");
        response = await axios.post(`${API}/generate`, {
          prompt: prompt.trim(),
          theme,
        }, { responseType: "blob" });
      }

      setStatus("rendering");
      setStatusMsg("Rendering document...");

      // Extract metadata from headers
      const model  = response.headers["x-model"] || "gemini";
      const blocks = response.headers["x-block-count"] || "?";
      const time   = response.headers["x-time-ms"] || String(Date.now() - startTime);

      // Build download URL
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);

      // Extract filename from content-disposition
      const cd = response.headers["content-disposition"] || "";
      const filenameMatch = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = filenameMatch ? filenameMatch[1].replace(/['"]/g, "") : "document.docx";

      setResult({ url, filename, model, blocks, time });
      setStatus("done");
      setStatusMsg("Document ready!");
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error
        || (err.response?.data instanceof Blob
          ? await err.response.data.text().then(t => { try { return JSON.parse(t).error; } catch { return t; } })
          : err.message);
      setError(String(msg || "Something went wrong."));
      setStatus("error");
      setStatusMsg("");
    }
  }, [prompt, theme, pdfFile]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
    }
  };

  const clearFile = () => {
    setPdfFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const themeObj = THEMES.find(t => t.id === theme) || THEMES[0];
  const isWorking = status === "thinking" || status === "rendering";

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <div className="logo-icon" style={{ background: themeObj.bg }}>
            <Layers size={20} color={themeObj.color} />
          </div>
          <div>
            <h1 className="logo-text">DocGen <span className="logo-agent">Agent</span></h1>
            <p className="logo-sub">AI-powered document designer</p>
          </div>
        </div>
        <div className="header-right">
          <div className="theme-selector">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`theme-dot ${theme === t.id ? "active" : ""}`}
                style={{ "--tc": t.color, "--tbg": t.bg }}
                onClick={() => setTheme(t.id)}
                title={t.label}
              />
            ))}
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────── */}
      <main className="main">
        {/* Input Card */}
        <div className="input-card">
          <div className="input-card-inner">
            <label className="input-label">
              <Sparkles size={16} style={{ color: themeObj.color }} />
              Describe the document you want to create
            </label>
            <textarea
              className="prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Write a detailed chapter on System Architecture for a smart city platform, including microservices, data flow, and deployment strategies..."
              rows={5}
              disabled={isWorking}
            />

            {/* PDF Upload */}
            <div className="input-row">
              <div className="pdf-zone">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                  id="pdf-upload"
                />
                {pdfFile ? (
                  <div className="pdf-badge">
                    <FileText size={16} />
                    <span className="pdf-name">{pdfFile.name}</span>
                    <button className="pdf-remove" onClick={clearFile}><X size={14} /></button>
                  </div>
                ) : (
                  <label htmlFor="pdf-upload" className="upload-btn">
                    <Upload size={16} />
                    Attach PDF source
                  </label>
                )}
              </div>

              <button
                className="generate-btn"
                style={{ "--accent": themeObj.color, "--accentBg": themeObj.bg }}
                onClick={handleGenerate}
                disabled={isWorking || (!prompt.trim() && !pdfFile)}
              >
                {isWorking ? (
                  <><Loader2 size={18} className="spin" /> Generating...</>
                ) : (
                  <><Zap size={18} /> Generate Document</>
                )}
              </button>
            </div>

            {/* Examples */}
            <button className="examples-toggle" onClick={() => setShowExamples(v => !v)}>
              <span>Example prompts</span>
              <ChevronDown size={14} className={showExamples ? "rotated" : ""} />
            </button>
            {showExamples && (
              <div className="examples-grid">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    className="example-chip"
                    onClick={() => { setPrompt(ex); setShowExamples(false); }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        {(status !== "idle") && (
          <div className={`status-card status-${status}`} style={{ "--accent": themeObj.color }}>
            {status === "thinking" && <Loader2 size={20} className="spin" />}
            {status === "rendering" && <Loader2 size={20} className="spin" />}
            {status === "done" && <CheckCircle2 size={20} />}
            {status === "error" && <AlertCircle size={20} />}
            <div className="status-text">
              {status === "error" ? error : statusMsg}
            </div>
          </div>
        )}

        {/* Result */}
        {result && status === "done" && (
          <div className="result-card" style={{ "--accent": themeObj.color, "--accentBg": themeObj.bg }}>
            <div className="result-header">
              <CheckCircle2 size={24} style={{ color: themeObj.color }} />
              <div>
                <h3 className="result-title">Document Ready</h3>
                <p className="result-meta">
                  {result.blocks} blocks \u00B7 {result.model} \u00B7 {(Number(result.time)/1000).toFixed(1)}s
                </p>
              </div>
            </div>
            <a href={result.url} download={result.filename} className="download-btn" style={{ "--accent": themeObj.color, "--accentBg": themeObj.bg }}>
              <Download size={20} />
              Download {result.filename}
            </a>
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="footer">
        <p>
          DocGen Agent uses a library of <strong>19 visual blocks</strong> that the AI composes
          dynamically — banners, layer cards, stat boxes, tables, info boxes, timelines, and more.
        </p>
      </footer>
    </div>
  );
}