'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
  CodeBracketIcon,
  MinusIcon
} from '@heroicons/react/24/outline'

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  editable?: boolean
}

export default function TiptapEditor({
  content,
  onChange,
  placeholder = '프로토콜 내용을 작성하세요...',
  editable = true
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4',
      },
    },
  })

  if (!editor) {
    return null
  }

  if (!editable) {
    return (
      <div className="border border-slate-200 rounded-md bg-slate-50">
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="border border-slate-300 rounded-md">
      {/* Toolbar */}
      <div className="border-b border-slate-300 bg-slate-50 p-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-slate-200 ${
            editor.isActive('bold') ? 'bg-slate-300' : ''
          }`}
          title="굵게"
        >
          <BoldIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-slate-200 ${
            editor.isActive('italic') ? 'bg-slate-300' : ''
          }`}
          title="기울임"
        >
          <ItalicIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          className={`p-2 rounded hover:bg-slate-200 ${
            editor.isActive('code') ? 'bg-slate-300' : ''
          }`}
          title="코드"
        >
          <CodeBracketIcon className="h-4 w-4" />
        </button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`px-2 py-1 rounded hover:bg-slate-200 text-sm font-semibold ${
            editor.isActive('heading', { level: 1 }) ? 'bg-slate-300' : ''
          }`}
          title="제목 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 rounded hover:bg-slate-200 text-sm font-semibold ${
            editor.isActive('heading', { level: 2 }) ? 'bg-slate-300' : ''
          }`}
          title="제목 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-2 py-1 rounded hover:bg-slate-200 text-sm font-semibold ${
            editor.isActive('heading', { level: 3 }) ? 'bg-slate-300' : ''
          }`}
          title="제목 3"
        >
          H3
        </button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-slate-200 ${
            editor.isActive('bulletList') ? 'bg-slate-300' : ''
          }`}
          title="글머리 기호 목록"
        >
          <ListBulletIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-slate-200 ${
            editor.isActive('orderedList') ? 'bg-slate-300' : ''
          }`}
          title="번호 매기기 목록"
        >
          <NumberedListIcon className="h-4 w-4" />
        </button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <button
          type="button"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="p-2 rounded hover:bg-slate-200"
          title="구분선"
        >
          <MinusIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  )
}
