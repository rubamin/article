import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

function Tool({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      className={`tool ${active ? 'on' : ''}`}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
    >
      {children}
    </button>
  );
}

// Word-style visual editor. Value in/out is HTML.
export default function WordEditor({ value, onChange, onUploadImage }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, force] = useState(0); // re-render toolbar on selection change

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    onSelectionUpdate: () => force((n) => n + 1),
    editorProps: { attributes: { class: 'word-page article-body' } },
  });

  // Content replaced from outside (Word import, switching from HTML mode, loading an article)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || '', false);
  }, [value, editor]);

  if (!editor) return null;
  const chain = () => editor.chain().focus();

  function setLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link address (leave empty to remove the link)', prev);
    if (url === null) return;
    if (!url.trim()) chain().unsetLink().run();
    else chain().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  async function pickImage(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const url = await onUploadImage(file);
      chain().setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="word-editor">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <div className="tool-group">
          <Tool label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</Tool>
          <Tool label="Sub-heading" active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</Tool>
          <Tool label="Normal text" active={editor.isActive('paragraph')} onClick={() => chain().setParagraph().run()}>¶</Tool>
        </div>
        <div className="tool-group">
          <Tool label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><b>B</b></Tool>
          <Tool label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><i>I</i></Tool>
          <Tool label="Underline" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}><u>U</u></Tool>
        </div>
        <div className="tool-group">
          <Tool label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>• List</Tool>
          <Tool label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>1. List</Tool>
          <Tool label="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>“ ”</Tool>
        </div>
        <div className="tool-group">
          <Tool label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()}>Left</Tool>
          <Tool label="Align centre" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()}>Centre</Tool>
          <Tool label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()}>Right</Tool>
        </div>
        <div className="tool-group">
          <Tool label="Link" active={editor.isActive('link')} onClick={setLink}>Link</Tool>
          <Tool label="Insert image" disabled={busy} onClick={() => fileRef.current.click()}>{busy ? 'Uploading…' : 'Image'}</Tool>
          <Tool label="Insert table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Table</Tool>
          {editor.isActive('table') && (
            <>
              <Tool label="Add row" onClick={() => chain().addRowAfter().run()}>+ Row</Tool>
              <Tool label="Add column" onClick={() => chain().addColumnAfter().run()}>+ Col</Tool>
              <Tool label="Delete table" onClick={() => chain().deleteTable().run()}>Delete table</Tool>
            </>
          )}
        </div>
        <div className="tool-group">
          <Tool label="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}>Undo</Tool>
          <Tool label="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}>Redo</Tool>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pickImage} />
      </div>
      {error && <p className="error small editor-error">{error}</p>}
      <div className="word-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
