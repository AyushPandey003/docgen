import { useState, useRef, useCallback } from "react";
import {
  GripVertical, X, Plus, Type, List, BarChart3, Palette,
  FileText, Hash, Table2, Info, AlertTriangle, Layers,
  Clock, BookOpen, Quote, Minus, Space, FileDown,
  Lightbulb, Target, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Block Definitions ──────────────────────────────────────────────────────
const BLOCK_DEFS = {
  banner:         { label: "Banner",          icon: FileText,       category: "structure",  desc: "Full-width colored title banner" },
  heading:        { label: "Heading",         icon: Type,           category: "structure",  desc: "Section heading (H1, H2, H3)" },
  toc:            { label: "Table of Contents", icon: BookOpen,     category: "structure",  desc: "Auto-generated from headings" },
  divider:        { label: "Divider",         icon: Minus,          category: "structure",  desc: "Visual separator line" },
  pageBreak:      { label: "Page Break",      icon: FileDown,       category: "structure",  desc: "Force a new page" },
  paragraph:      { label: "Paragraph",       icon: FileText,       category: "content",    desc: "Body text paragraph(s)" },
  bulletList:     { label: "Bullet List",     icon: List,           category: "content",    desc: "Unordered list of items" },
  numberedList:   { label: "Numbered List",   icon: Hash,           category: "content",    desc: "Ordered list of items" },
  quote:          { label: "Quote",           icon: Quote,          category: "content",    desc: "Styled blockquote" },
  table:          { label: "Table",           icon: Table2,         category: "data",       desc: "Data table with headers" },
  keyValueTable:  { label: "Key-Value Table", icon: Table2,         category: "data",       desc: "Attribute-detail pairs" },
  objectiveTable: { label: "Objective Table", icon: Target,         category: "data",       desc: "Numbered objectives" },
  statCards:      { label: "Stat Cards",      icon: BarChart3,      category: "data",       desc: "Row of colored metric boxes" },
  layerCards:     { label: "Layer Cards",     icon: Layers,         category: "visual",     desc: "Architecture layer cards" },
  timeline:       { label: "Timeline",        icon: Clock,          category: "visual",     desc: "Sequential process steps" },
  infoBox:        { label: "Info Box",        icon: Info,           category: "visual",     desc: "Highlighted information box" },
  callout:        { label: "Callout",         icon: AlertTriangle,  category: "visual",     desc: "Tip / Warning / Note box" },
  summaryBox:     { label: "Summary Box",     icon: Lightbulb,      category: "visual",     desc: "Dark recap box" },
};

const CATEGORIES = [
  { id: "structure", label: "Structure", color: "#6B7280" },
  { id: "content",   label: "Content",   color: "#2E75B6" },
  { id: "data",      label: "Data",      color: "#2D7A50" },
  { id: "visual",    label: "Visual",    color: "#6B42C8" },
];

// ── Unique ID Generator ────────────────────────────────────────────────────
let _uid = 0;
function uid() { return `lb_${Date.now()}_${++_uid}`; }

// ── Component ──────────────────────────────────────────────────────────────
export default function LayoutBuilder({ blocks, onChange, accentColor }) {
  const [dragSource, setDragSource] = useState(null);     // {from: "palette"|"sequence", type, index?}
  const [dropTarget, setDropTarget] = useState(null);      // index in sequence
  const [collapsedCats, setCollapsedCats] = useState({});
  const seqRef = useRef(null);

  // ── Palette Drag ──────────────────────────────────────────
  const onPaletteDragStart = (e, type) => {
    setDragSource({ from: "palette", type });
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", type);
  };

  // ── Sequence Drag (reorder) ───────────────────────────────
  const onSeqDragStart = (e, index) => {
    setDragSource({ from: "sequence", index });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onSeqDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSource?.from === "palette" ? "copy" : "move";
    setDropTarget(index);
  };

  const onSeqDragLeave = () => {
    setDropTarget(null);
  };

  const onSeqDrop = useCallback((e, targetIndex) => {
    e.preventDefault();
    setDropTarget(null);

    if (!dragSource) return;

    const next = [...blocks];

    if (dragSource.from === "palette") {
      // Insert new block from palette
      next.splice(targetIndex, 0, { id: uid(), type: dragSource.type, hint: "" });
    } else if (dragSource.from === "sequence") {
      // Reorder within sequence
      const srcIdx = dragSource.index;
      if (srcIdx === targetIndex) return;
      const [moved] = next.splice(srcIdx, 1);
      const insertAt = srcIdx < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(insertAt, 0, moved);
    }

    onChange(next);
    setDragSource(null);
  }, [blocks, dragSource, onChange]);

  // Drop at end of sequence
  const onZoneDrop = useCallback((e) => {
    e.preventDefault();
    setDropTarget(null);

    if (!dragSource) return;
    const next = [...blocks];

    if (dragSource.from === "palette") {
      next.push({ id: uid(), type: dragSource.type, hint: "" });
    }
    // Reorder to end
    if (dragSource.from === "sequence") {
      const [moved] = next.splice(dragSource.index, 1);
      next.push(moved);
    }

    onChange(next);
    setDragSource(null);
  }, [blocks, dragSource, onChange]);

  const onDragEnd = () => {
    setDragSource(null);
    setDropTarget(null);
  };

  // ── Block Actions ─────────────────────────────────────────
  const removeBlock = (index) => {
    const next = [...blocks];
    next.splice(index, 1);
    onChange(next);
  };

  const updateHint = (index, hint) => {
    const next = [...blocks];
    next[index] = { ...next[index], hint };
    onChange(next);
  };

  const addBlock = (type) => {
    onChange([...blocks, { id: uid(), type, hint: "" }]);
  };

  const toggleCat = (catId) => {
    setCollapsedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="lb-container">
      {/* Palette */}
      <div className="lb-palette">
        <div className="lb-palette-title">Block Palette</div>
        <p className="lb-palette-hint">Drag blocks to the layout or click to add</p>
        {CATEGORIES.map(cat => {
          const catBlocks = Object.entries(BLOCK_DEFS).filter(([,v]) => v.category === cat.id);
          const isCollapsed = collapsedCats[cat.id];
          return (
            <div key={cat.id} className="lb-cat">
              <button className="lb-cat-header" onClick={() => toggleCat(cat.id)}>
                <span className="lb-cat-dot" style={{ background: cat.color }} />
                <span className="lb-cat-label">{cat.label}</span>
                <span className="lb-cat-count">{catBlocks.length}</span>
                {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
              {!isCollapsed && (
                <div className="lb-cat-blocks">
                  {catBlocks.map(([type, def]) => {
                    const Icon = def.icon;
                    return (
                      <div
                        key={type}
                        className="lb-chip"
                        draggable
                        onDragStart={e => onPaletteDragStart(e, type)}
                        onDragEnd={onDragEnd}
                        onClick={() => addBlock(type)}
                        title={def.desc}
                        style={{ "--chip-color": cat.color }}
                      >
                        <Icon size={14} />
                        <span>{def.label}</span>
                        <Plus size={12} className="lb-chip-add" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sequence */}
      <div className="lb-sequence" ref={seqRef}>
        <div className="lb-seq-title">
          Document Layout
          <span className="lb-seq-count">{blocks.length} block{blocks.length !== 1 ? "s" : ""}</span>
        </div>

        {blocks.length === 0 ? (
          <div
            className={`lb-empty ${dragSource ? "lb-empty-active" : ""}`}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={onZoneDrop}
          >
            <Layers size={32} style={{ color: accentColor || "#4F8EF7", opacity: 0.5 }} />
            <p>Drag blocks here to build your layout</p>
            <p className="lb-empty-sub">or click blocks in the palette to add</p>
          </div>
        ) : (
          <div
            className="lb-seq-list"
            onDragOver={e => { e.preventDefault(); }}
            onDrop={onZoneDrop}
          >
            {blocks.map((block, i) => {
              const def = BLOCK_DEFS[block.type];
              if (!def) return null;
              const Icon = def.icon;
              const cat = CATEGORIES.find(c => c.id === def.category);
              const isDropHere = dropTarget === i;

              return (
                <div key={block.id}>
                  {isDropHere && <div className="lb-drop-indicator" style={{ "--indicator-color": accentColor || "#4F8EF7" }} />}
                  <div
                    className={`lb-block ${dragSource?.from === "sequence" && dragSource.index === i ? "lb-block-dragging" : ""}`}
                    draggable
                    onDragStart={e => onSeqDragStart(e, i)}
                    onDragOver={e => onSeqDragOver(e, i)}
                    onDragLeave={onSeqDragLeave}
                    onDragEnd={onDragEnd}
                  >
                    <div className="lb-block-handle">
                      <GripVertical size={16} />
                    </div>
                    <div className="lb-block-num" style={{ background: cat?.color || "#666" }}>
                      {i + 1}
                    </div>
                    <div className="lb-block-body">
                      <div className="lb-block-top">
                        <Icon size={14} style={{ color: cat?.color || "#666" }} />
                        <span className="lb-block-label">{def.label}</span>
                        <span className="lb-block-desc">{def.desc}</span>
                      </div>
                      <input
                        className="lb-block-hint"
                        type="text"
                        placeholder={`Hint: e.g. "${block.type === "statCards" ? "show 4 performance metrics" : block.type === "table" ? "comparison of tech stack options" : "content guidance for AI..."}"`}
                        value={block.hint}
                        onChange={e => updateHint(i, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <button className="lb-block-remove" onClick={() => removeBlock(i)} title="Remove block">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Final drop zone */}
            <div
              className={`lb-drop-final ${dragSource ? "lb-drop-final-active" : ""}`}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = dragSource?.from === "palette" ? "copy" : "move"; }}
              onDrop={onZoneDrop}
            >
              <Plus size={14} /> Drop here
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
