import React, { useRef } from 'react';
import { Btn, BigBtn, Sep, Icon, Group, ICONS } from './RibbonControls';

/** Inserts a radiology report section heading + empty body paragraph. */
function insertSection(editor, title) {
  editor.chain().focus().insertContent(`<h2>${title}</h2><p></p>`).run();
}

/** Scans all heading nodes and builds a static Table of Contents block. */
function insertToc(editor) {
  const headings = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level, text: node.textContent.trim() });
    }
  });
  if (!headings.length) {
    // No headings — still insert a placeholder so the user sees structure
    headings.push({ level: 2, text: 'Add headings to populate this list…' });
  }

  const itemsHtml = headings.map(({ level, text }) => {
    const indent  = (level - 1) * 20;
    const fsize   = level === 1 ? '12pt' : level === 2 ? '11pt' : '10pt';
    const fweight = level === 1 ? '700' : '400';
    return `<p style="margin:1px 0;padding-left:${indent}px;font-size:${fsize};font-weight:${fweight};color:#1e293b">${text}</p>`;
  }).join('');

  const tocHtml = `
    <div style="border:1px solid #cbd5e1;border-radius:4px;padding:12px 16px;background:#f8fafc;margin:8px 0">
      <p style="font-size:12pt;font-weight:700;color:#0f172a;margin:0 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
        Table of Contents
      </p>
      ${itemsHtml}
    </div>
    <p></p>`;
  editor.chain().focus().insertContent(tocHtml).run();
}

const SECTIONS = [
  { key: 'clinical',        label: 'Clinical Hx',   title: 'Clinical History',  icon: '📋' },
  { key: 'technique',       label: 'Technique',      title: 'Technique',         icon: '⚙️' },
  { key: 'findings',        label: 'Findings',       title: 'Findings',          icon: '🔍' },
  { key: 'impression',      label: 'Impression',     title: 'Impression',        icon: '📝' },
  { key: 'recommendation',  label: 'Recommend.',     title: 'Recommendation',    icon: '💡' },
];

/**
 * InsertTab — report templates, sections, table, image, link, page break, symbol,
 *             structured fields, etc.
 */
export default function InsertTab({ editor, onOpenTemplates, onOpenNormalFindings, onOpenMeasurement, onOpenRads }) {
  if (!editor) return null;

  const imageInputRef = useRef(null);

  const handleImageFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor.chain().focus().setImage({ src: ev.target.result, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertField = (type, label) => {
    editor.chain().focus().insertStructuredField(type, label).run();
  };

  // The Impression section drops in the heading PLUS an auto-numbered list (the
  // way every report's impression is written); other sections are heading-only.
  const insertSectionOrList = (s) =>
    s.key === 'impression'
      ? editor.chain().focus().insertImpressionList().run()
      : insertSection(editor, s.title);

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {/* ── Templates ── */}
      <Group label="Templates">
        <BigBtn
          icon="📋"
          label="Templates"
          title="Pick a radiology report template"
          onClick={onOpenTemplates}
        />
      </Group>

      <Sep />

      {/* ── Radiology Sections ── */}
      <Group label="Report Sections">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', height: '100%' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {SECTIONS.slice(0, 3).map(s => (
              <Btn
                key={s.key}
                title={`Insert "${s.title}" section`}
                onClick={() => insertSectionOrList(s)}
                style={{ fontSize: '10px', padding: '0 5px', whiteSpace: 'nowrap', height: '22px' }}
              >
                {s.icon} {s.label}
              </Btn>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            {SECTIONS.slice(3).map(s => (
              <Btn
                key={s.key}
                title={`Insert "${s.title}" section`}
                onClick={() => insertSectionOrList(s)}
                style={{ fontSize: '10px', padding: '0 5px', whiteSpace: 'nowrap', height: '22px' }}
              >
                {s.icon} {s.label}
              </Btn>
            ))}
          </div>
        </div>
      </Group>

      <Sep />

      <Group label="Tables">
        <BigBtn
          icon={<Icon d={ICONS.table} size={20} />}
          label="Table"
          title="Insert a 3×3 table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
      </Group>

      <Sep />

      <Group label="Illustrations">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageFile}
        />
        <BigBtn
          icon={<Icon d={ICONS.image} size={20} />}
          label="Image"
          title="Insert image from file"
          onClick={() => imageInputRef.current?.click()}
        />
      </Group>

      <Sep />

      <Group label="Links">
        <BigBtn
          icon={<Icon d={ICONS.link} size={20} />}
          label="Link"
          title="Insert hyperlink"
          onClick={() => {
            const url = window.prompt('Enter URL:', 'https://');
            if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
          }}
        />
      </Group>

      <Sep />

      <Group label="Symbols">
        <BigBtn
          icon={<Icon d={ICONS.symbol} size={20} />}
          label="Symbol"
          title="Insert symbol (°, µ, ±, Greek letters, …)"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-symbol-picker'))}
        />
      </Group>

      <Sep />

      <Group label="Page Elements">
        <BigBtn
          icon={<Icon d={ICONS.pageBreak} size={20} />}
          label="Page Break"
          title="Insert Page Break (Ctrl+Enter)"
          onClick={() => editor.chain().focus().insertPageBreak().run()}
        />
        <BigBtn
          icon={<Icon d={ICONS.hr} size={20} />}
          label="Horizontal Rule"
          title="Insert a horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
        <BigBtn
          icon="📑"
          label="TOC"
          title="Insert a Table of Contents based on current headings"
          onClick={() => insertToc(editor)}
        />
        <BigBtn
          icon="†"
          label="Footnote"
          title="Insert a footnote reference at cursor"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:insert-footnote'))}
        />
      </Group>

      <Sep />

      {/* ── Structured Fields ── */}
      <Group label="Fields">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', height: '100%' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            <Btn onClick={() => insertField('patient-name', 'Patient')}
                 title="Insert Patient Name field" style={{ fontSize: '10px', padding: '0 5px', height: '22px', whiteSpace: 'nowrap' }}>
              👤 Patient
            </Btn>
            <Btn onClick={() => insertField('accession', 'Accession #')}
                 title="Insert Accession Number field" style={{ fontSize: '10px', padding: '0 5px', height: '22px', whiteSpace: 'nowrap' }}>
              🔢 Acc #
            </Btn>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <Btn onClick={() => insertField('study-date', 'Study Date')}
                 title="Insert Study Date field" style={{ fontSize: '10px', padding: '0 5px', height: '22px', whiteSpace: 'nowrap' }}>
              📅 Date
            </Btn>
            <Btn onClick={() => insertField('modality', 'Modality')}
                 title="Insert Modality field" style={{ fontSize: '10px', padding: '0 5px', height: '22px', whiteSpace: 'nowrap' }}>
              🔬 Mod.
            </Btn>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <Btn onClick={() => insertField('physician', 'Referring MD')}
                 title="Insert Referring Physician field" style={{ fontSize: '10px', padding: '0 5px', height: '22px', whiteSpace: 'nowrap' }}>
              👨‍⚕️ Ref. MD
            </Btn>
            <Btn onClick={() => insertField('radiologist', 'Radiologist')}
                 title="Insert Radiologist field" style={{ fontSize: '10px', padding: '0 5px', height: '22px', whiteSpace: 'nowrap' }}>
              🩺 Rad.
            </Btn>
          </div>
        </div>
      </Group>

      <Sep />

      {/* ── Normal Findings Library ── */}
      <Group label="Normal Findings">
        <BigBtn
          icon="✅"
          label="Normal Lib."
          title="Insert normal findings from the library"
          onClick={onOpenNormalFindings}
        />
      </Group>

      <Sep />

      {/* ── Structured RADS reporting ── */}
      <Group label="Structured">
        <BigBtn
          icon="🎯"
          label="RADS"
          title="BI-RADS / TI-RADS / Lung-RADS / PI-RADS / LI-RADS assistant"
          onClick={onOpenRads}
        />
      </Group>

      <Sep />

      {/* ── Text box / callout ── */}
      <Group label="Text Box">
        <BigBtn
          icon="📦"
          label="Text Box"
          title="Insert a bordered text box / note callout"
          onClick={() => editor.chain().focus().insertCallout().run()}
        />
      </Group>

      <Sep />

      {/* ── Measurement Formatter ── */}
      <Group label="Measurement">
        <BigBtn
          icon="📏"
          label="Measure"
          title="Format and insert a clinical measurement"
          onClick={onOpenMeasurement}
        />
      </Group>
    </div>
  );
}
