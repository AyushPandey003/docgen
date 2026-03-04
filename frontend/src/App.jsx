import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import {
  FileText, Upload, Download, Sparkles, Loader2,
  CheckCircle2, AlertCircle, Palette, Zap, Layers,
  X, ChevronDown, Key, Eye, EyeOff, Shield, LayoutGrid,
} from "lucide-react";
import LayoutBuilder from "./LayoutBuilder";

// ── Config ─────────────────────────────────────────────────────────────────
const API = "/api";
const STORAGE_KEY = "docgen_gemini_api_key";

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

// ── API Key Helpers ────────────────────────────────────────────────────────
function getSavedKey() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; }
  catch { return ""; }
}

function saveKey(key) {
  try { if (key) localStorage.setItem(STORAGE_KEY, key); else localStorage.removeItem(STORAGE_KEY); }
  catch { /* localStorage unavailable */ }
}

function getAuthHeaders(apiKey) {
  const headers = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [prompt, setPrompt]       = useState("");
  const [theme, setTheme]         = useState("blue");
  const [pdfFile, setPdfFile]     = useState(null);
  const [status, setStatus]       = useState("idle");       // idle | thinking | rendering | done | error
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult]       = useState(null);          // { url, filename, model, blocks, time }
  const [error, setError]         = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const fileRef = useRef(null);

  // ── Layout Builder State ───────────────────────────────────────
  const [showLayout, setShowLayout]     = useState(false);
  const [layoutBlocks, setLayoutBlocks] = useState([]);

  // ── API Key State ──────────────────────────────────────────────
  const [apiKey, setApiKey]               = useState(getSavedKey);
  const [showKeyModal, setShowKeyModal]   = useState(false);
  const [keyInput, setKeyInput]           = useState("");
  const [keyVisible, setKeyVisible]       = useState(false);
  const [keyStatus, setKeyStatus]         = useState("idle"); // idle | validating | valid | invalid
  const [keyError, setKeyError]           = useState("");

  // Prompt to set key on first visit
  useEffect(() => {
    if (!apiKey) {
      const timer = setTimeout(() => setShowKeyModal(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleValidateKey = async () => {
    const trimmedKey = keyInput.trim();
    if (!trimmedKey) { setKeyError("Please enter an API key."); return; }

    setKeyStatus("validating");
    setKeyError("");

    try {
      const res = await axios.post(`${API}/validate-key`, {}, {
        headers: { "X-API-Key": trimmedKey },
      });
      if (res.data.valid) {
        setKeyStatus("valid");
        setApiKey(trimmedKey);
        saveKey(trimmedKey);
        setTimeout(() => setShowKeyModal(false), 800);
      } else {
        setKeyStatus("invalid");
        setKeyError(res.data.error || "Invalid API key.");
      }
    } catch (err) {
      setKeyStatus("invalid");
      setKeyError(err.response?.data?.error || "Could not validate key. Check your key and try again.");
    }
  };

  const handleClearKey = () => {
    setApiKey("");
    saveKey("");
    setKeyInput("");
    setKeyStatus("idle");
    setKeyError("");
  };

  const openKeyModal = () => {
    setKeyInput(apiKey);
    setKeyStatus(apiKey ? "valid" : "idle");
    setKeyError("");
    setKeyVisible(false);
    setShowKeyModal(true);
  };

  // ── Document Generation ────────────────────────────────────────
  const reset = () => {
    setStatus("idle"); setStatusMsg(""); setResult(null); setError("");
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !pdfFile) return;
    if (!apiKey) { openKeyModal(); return; }

    reset();
    setStatus("thinking");
    setStatusMsg("Agent is analyzing your request and designing the document layout...");

    try {
      let response;
      const startTime = Date.now();
      const authHeaders = getAuthHeaders(apiKey);
      const activeLayout = showLayout && layoutBlocks.length > 0
        ? layoutBlocks.map(b => ({ type: b.type, hint: b.hint || undefined }))
        : undefined;

      if (pdfFile) {
        // PDF mode
        setStatusMsg("Agent is reading the PDF and planning visual components...");
        const form = new FormData();
        form.append("file", pdfFile);
        if (prompt.trim()) form.append("prompt", prompt.trim());
        form.append("theme", theme);
        if (activeLayout) form.append("layoutBlocks", JSON.stringify(activeLayout));

        response = await axios.post(`${API}/generate-from-pdf`, form, {
          responseType: "blob",
          headers: { "Content-Type": "multipart/form-data", ...authHeaders },
        });
      } else {
        // Text prompt mode
        setStatusMsg(showLayout && layoutBlocks.length > 0
          ? "Agent is following your custom layout and generating content..."
          : "Agent is composing blocks and generating content...");
        response = await axios.post(`${API}/generate`, {
          prompt: prompt.trim(),
          theme,
          layoutBlocks: activeLayout,
        }, { responseType: "blob", headers: authHeaders });
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
      let msg;
      if (err.response?.status === 401) {
        msg = "Invalid or expired API key. Please update your key in settings.";
        handleClearKey();
      } else {
        msg = err.response?.data?.error
          || (err.response?.data instanceof Blob
            ? await err.response.data.text().then(t => { try { return JSON.parse(t).error; } catch { return t; } })
            : err.message);
      }
      setError(String(msg || "Something went wrong."));
      setStatus("error");
      setStatusMsg("");
    }
  }, [prompt, theme, pdfFile, apiKey]);

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
  const hasKey = Boolean(apiKey);

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
          <button
            className={`key-btn ${hasKey ? "key-active" : "key-missing"}`}
            onClick={openKeyModal}
            title={hasKey ? "API key configured" : "Set your API key"}
          >
            <Key size={16} />
            <span className={`key-dot ${hasKey ? "dot-green" : "dot-red"}`} />
          </button>
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

      {/* ── API Key Modal ──────────────────────── */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => apiKey && setShowKeyModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon">
                <Shield size={22} />
              </div>
              <div>
                <h2 className="modal-title">API Key Settings</h2>
                <p className="modal-sub">Your key is stored locally in your browser and never saved on our servers.</p>
              </div>
              {apiKey && (
                <button className="modal-close" onClick={() => setShowKeyModal(false)}>
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="modal-body">
              <label className="modal-label">Gemini API Key</label>
              <div className="key-input-row">
                <input
                  type={keyVisible ? "text" : "password"}
                  className="key-input"
                  value={keyInput}
                  onChange={e => { setKeyInput(e.target.value); setKeyStatus("idle"); setKeyError(""); }}
                  placeholder="AIzaSy..."
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleValidateKey()}
                />
                <button className="key-toggle" onClick={() => setKeyVisible(v => !v)} title={keyVisible ? "Hide" : "Show"}>
                  {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {keyError && (
                <div className="key-error">
                  <AlertCircle size={14} /> {keyError}
                </div>
              )}

              {keyStatus === "valid" && (
                <div className="key-success">
                  <CheckCircle2 size={14} /> API key is valid and saved!
                </div>
              )}

              <p className="key-hint">
                Get your free key at{" "}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                  Google AI Studio
                </a>
              </p>
            </div>

            <div className="modal-actions">
              {apiKey && (
                <button className="key-clear-btn" onClick={handleClearKey}>
                  Remove Key
                </button>
              )}
              <button
                className="key-save-btn"
                onClick={handleValidateKey}
                disabled={keyStatus === "validating" || !keyInput.trim()}
              >
                {keyStatus === "validating" ? (
                  <><Loader2 size={16} className="spin" /> Validating...</>
                ) : (
                  <><CheckCircle2 size={16} /> Validate & Save</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ───────────────────────────────── */}
      <main className="main">
        {/* No-key banner */}
        {!hasKey && !showKeyModal && (
          <div className="key-banner" onClick={openKeyModal}>
            <Key size={18} />
            <span>Add your Gemini API key to get started</span>
            <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
          </div>
        )}

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

            {/* Layout Builder Toggle */}
            <button
              className={`layout-toggle ${showLayout ? "layout-toggle-active" : ""}`}
              onClick={() => setShowLayout(v => !v)}
              style={{ "--lt-color": themeObj.color }}
            >
              <LayoutGrid size={16} />
              <span>{showLayout ? "Hide Layout Builder" : "Customize Layout"}</span>
              {showLayout && layoutBlocks.length > 0 && (
                <span className="layout-badge">{layoutBlocks.length}</span>
              )}
              <ChevronDown size={14} className={showLayout ? "rotated" : ""} />
            </button>
          </div>
        </div>

        {/* Layout Builder */}
        {showLayout && (
          <LayoutBuilder
            blocks={layoutBlocks}
            onChange={setLayoutBlocks}
            accentColor={themeObj.color}
          />
        )}

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
                  {result.blocks} blocks · {result.model} · {(Number(result.time)/1000).toFixed(1)}s
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