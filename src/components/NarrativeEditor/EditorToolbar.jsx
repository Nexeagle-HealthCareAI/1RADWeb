import React, { useState } from 'react';

const EditorToolbar = ({ editor, onSave }) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);

  if (!editor) {
    return null;
  }

  const colors = [
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f59e0b' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Purple', value: '#8b5cf6' },
  ];

  const highlights = [
    { name: 'None', value: null },
    { name: 'Yellow', value: '#fef3c7' },
    { name: 'Green', value: '#dcfce7' },
    { name: 'Blue', value: '#dbeafe' },
    { name: 'Red', value: '#fee2e2' },
  ];

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="narrative-editor-toolbar">
      {/* History Controls */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="toolbar-btn"
          title="Undo (Ctrl+Z)"
        >
          ↩️
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="toolbar-btn"
          title="Redo (Ctrl+Y)"
        >
          ↪️
        </button>
      </div>

      <div className="toolbar-divider"></div>

      {/* Text Formatting */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`toolbar-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      <div className="toolbar-divider"></div>

      {/* Headings */}
      <div className="toolbar-group">
        <select
          onChange={(e) => {
            const level = parseInt(e.target.value);
            if (level === 0) {
              editor.chain().focus().setParagraph().run();
            } else {
              editor.chain().focus().toggleHeading({ level }).run();
            }
            e.target.value = '0';
          }}
          className="toolbar-select"
          title="Heading"
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
        </select>
      </div>

      <div className="toolbar-divider"></div>

      {/* Lists */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
          title="Bullet List"
        >
          •
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
          title="Numbered List"
        >
          1.
        </button>
      </div>

      <div className="toolbar-divider"></div>

      {/* Alignment */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
          title="Align Left"
        >
          ⬅
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
          title="Align Center"
        >
          ↔
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
          title="Align Right"
        >
          ➡
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}`}
          title="Justify"
        >
          ⬌
        </button>
      </div>

      <div className="toolbar-divider"></div>

      {/* Colors */}
      <div className="toolbar-group">
        <div className="toolbar-dropdown">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="toolbar-btn"
            title="Text Color"
          >
            🎨
          </button>
          {showColorPicker && (
            <div className="toolbar-dropdown-menu">
              {colors.map((color) => (
                <button
                  key={color.value}
                  onClick={() => {
                    editor.chain().focus().setColor(color.value).run();
                    setShowColorPicker(false);
                  }}
                  className="color-option"
                  style={{ color: color.value }}
                >
                  <span className="color-swatch" style={{ background: color.value }}></span>
                  {color.name}
                </button>
              ))}
              <button
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
                className="color-option"
              >
                ✕ Clear Color
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-dropdown">
          <button
            onClick={() => setShowHighlightPicker(!showHighlightPicker)}
            className="toolbar-btn"
            title="Highlight"
          >
            ✍️
          </button>
          {showHighlightPicker && (
            <div className="toolbar-dropdown-menu">
              {highlights.map((highlight) => (
                <button
                  key={highlight.name}
                  onClick={() => {
                    if (highlight.value) {
                      editor.chain().focus().setHighlight({ color: highlight.value }).run();
                    } else {
                      editor.chain().focus().unsetHighlight().run();
                    }
                    setShowHighlightPicker(false);
                  }}
                  className="color-option"
                >
                  {highlight.value && (
                    <span className="color-swatch" style={{ background: highlight.value }}></span>
                  )}
                  {highlight.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-divider"></div>

      {/* Insert */}
      <div className="toolbar-group">
        <button
          onClick={addTable}
          className="toolbar-btn"
          title="Insert Table"
        >
          ▦
        </button>
        <button
          onClick={addImage}
          className="toolbar-btn"
          title="Insert Image"
        >
          🖼️
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="toolbar-btn"
          title="Horizontal Line"
        >
          ―
        </button>
      </div>

      <div className="toolbar-divider"></div>

      {/* Clear Formatting */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className="toolbar-btn"
          title="Clear Formatting"
        >
          🧹
        </button>
      </div>

      {/* Save Button */}
      {onSave && (
        <>
          <div className="toolbar-spacer"></div>
          <button
            onClick={onSave}
            className="toolbar-btn toolbar-btn-primary"
            title="Save (Ctrl+S)"
          >
            💾 Save
          </button>
        </>
      )}
    </div>
  );
};

export default EditorToolbar;
