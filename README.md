# DocGen — AI-Powered Document Generator

A full-stack application that generates beautiful, formatted `.docx` files from structured JSON.
Built with **React + Vite** (frontend) and **Node.js + Express** (backend) using the `docx` npm library.

---

## Project Structure

```
docgen/
├── backend/
│   ├── server.js          ← Express API server
│   ├── docGenerator.js    ← Core .docx generation engine
│   ├── package.json
│   └── .env.example       ← Copy to .env and add your keys
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx        ← Main React UI
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
npm run dev        # starts on http://localhost:5000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev        # starts on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## API Endpoints

### `POST /api/generate`
Generate a document from structured JSON.

**Request Body:**
```json
{
  "title": "My Document",
  "style": "professional",
  "fontTheme": "blue",
  "includeTableOfContents": true,
  "sections": [
    {
      "heading": "Introduction",
      "content": "First paragraph.\n\nSecond paragraph.",
      "bullets": ["Point one", "Point two"],
      "table": [["Name", "Value"], ["Alpha", "100"]],
      "infoBox": "Important highlighted note here."
    }
  ]
}
```

**Response:** `.docx` file download

---

### `POST /api/generate-from-ai`
Generate from Gemini AI structured output.

**Request Body:**
```json
{
  "geminiResponse": { ...same shape as above... }
}
```

---

### `POST /api/generate-from-pdf-context`
Generate any chapter/topic using a source PDF as context.

**Request Body:**
```json
{
  "pdfPath": "C:/Users/ayush/Downloads/docgen/docgen/Janawaaz (2).pdf",
  "chapterLabel": "Chapter 2: Literature Review",
  "request": "Write a strong literature review with key themes, comparisons, and research gaps.",
  "title": "Chapter 2 Literature Review",
  "style": "academic",
  "fontTheme": "blue",
  "includeTableOfContents": true,
  "generationMode": "auto"
}
```

**`generationMode` options:**
- `auto` → tries direct PDF to Gemini first, falls back to extracted text.
- `direct_pdf` → sends the PDF binary directly to Gemini.
- `extracted_text` → parses text from PDF first, then sends text context.

Use the same endpoint for any chapter (Chapter 1/2/3/etc.) by changing `chapterLabel` and `request`.

---

## Integrating Gemini AI

### Step 1 — Add your API key
```bash
# backend/.env
GEMINI_API_KEY=your_key_here
```

### Step 2 — Install the Gemini SDK
```bash
cd backend
npm install @google/generative-ai
```

### Step 3 — Create `backend/geminiService.js`
```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a document generation assistant.
When the user describes a document they want, respond ONLY with valid JSON:
{
  "title": "Document Title",
  "fontTheme": "blue",
  "style": "professional",
  "includeTableOfContents": true,
  "sections": [
    {
      "heading": "Section Title",
      "content": "Paragraph text. Use double newlines for new paragraphs.",
      "bullets": ["Optional bullet 1"],
      "table": [["Col A", "Col B"], ["Row1A", "Row1B"]],
      "infoBox": "Optional note"
    }
  ]
}
fontTheme must be: blue | green | purple | dark`;

async function generateDocumentPlan(userPrompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: userPrompt }
  ]);
  const raw = result.response.text().replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

module.exports = { generateDocumentPlan };
```

### Step 4 — Add AI route to `server.js`
```javascript
const { generateDocumentPlan } = require("./geminiService");

app.post("/api/prompt", async (req, res) => {
  try {
    const { prompt } = req.body;
    const plan = await generateDocumentPlan(prompt);

    const filename = `ai_doc_${Date.now()}.docx`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await generateDocument(plan, filepath);

    res.download(filepath, `${plan.title}.docx`, () => {
      fs.unlink(filepath, () => {});
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Step 5 — Add AI input in `App.jsx`
```jsx
const [aiPrompt, setAiPrompt] = useState("");

const handleAiGenerate = async () => {
  setStatus("loading");
  try {
    const res = await axios.post("/api/prompt",
      { prompt: aiPrompt },
      { responseType: "blob" }
    );
    // ... same download logic as handleGenerate
  } catch (err) {
    setStatus("error");
  }
};

// In JSX:
<textarea
  placeholder="Describe the document you want… e.g. 'Create a project report for a mobile app with sections for Introduction, Features, and Timeline'"
  value={aiPrompt}
  onChange={(e) => setAiPrompt(e.target.value)}
/>
<button onClick={handleAiGenerate}>
  Generate with Gemini
</button>
```

---

## Available Themes

| Theme ID | Name           | Primary Color |
|----------|----------------|---------------|
| `blue`   | Ocean Blue     | `#2E75B6`     |
| `green`  | Forest Green   | `#2D7A50`     |
| `purple` | Deep Purple    | `#6B42C8`     |
| `dark`   | Midnight Dark  | `#374151`     |

---

## Section Schema Reference

```typescript
{
  heading: string;           // Required — section title
  content?: string;          // Paragraphs, separated by \n\n
  bullets?: string[];        // Bullet point list
  table?: string[][];        // 2D array, first row = headers
  infoBox?: string;          // Highlighted callout box
}
```

---

## Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Frontend  | React 18 + Vite         |
| Backend   | Node.js + Express       |
| Docx Gen  | `docx` npm library      |
| AI (opt.) | Google Gemini 1.5 Flash |
| Styling   | Pure CSS (no Tailwind)  |
