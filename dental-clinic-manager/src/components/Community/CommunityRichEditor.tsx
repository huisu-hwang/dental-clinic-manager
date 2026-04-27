'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Loader2 } from 'lucide-react'
import { communityAttachmentService } from '@/lib/communityService'

interface CommunityRichEditorProps {
  value: string
  onChange: (html: string) => void
  profileId: string
  placeholder?: string
}

const DEFAULT_PLACEHOLDER =
  '내용을 입력하세요. 캡쳐한 이미지(Cmd/Ctrl+V)나 드래그앤드롭으로 본문에 이미지를 삽입할 수 있습니다.'

export default function CommunityRichEditor({
  value,
  onChange,
  profileId,
  placeholder,
}: CommunityRichEditorProps) {
  const uploadingCountRef = useRef(0)
  const uploadAndInsertRef = useRef<(file: File) => void>(() => {})

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'community-content-image rounded-lg max-w-full h-auto my-2',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || DEFAULT_PLACEHOLDER,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'prose max-w-none focus:outline-none min-h-[280px] px-3 py-2 text-sm leading-relaxed',
      },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items
        if (!items || items.length === 0) return false
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              uploadAndInsertRef.current(file)
              return true
            }
          }
        }
        return false
      },
      handleDrop(_view, event, _slice, moved) {
        if (moved) return false
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        const imageFiles: File[] = []
        for (let i = 0; i < files.length; i++) {
          const f = files.item(i)
          if (f && f.type.startsWith('image/')) imageFiles.push(f)
        }
        if (imageFiles.length === 0) return false
        event.preventDefault()
        imageFiles.forEach((f) => uploadAndInsertRef.current(f))
        return true
      },
    },
  })

  // 외부 value 변경(수정 모드 진입 등) 시 에디터 동기화
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
    // editor가 바뀔 때마다 dep으로 추가해 무한루프 방지를 위해 ref 비교만 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  const uploadAndInsert = useCallback(
    async (file: File) => {
      if (!editor) return
      uploadingCountRef.current += 1
      const tempUrl = URL.createObjectURL(file)
      editor.chain().focus().setImage({ src: tempUrl }).run()

      const { url, error } = await communityAttachmentService.uploadInlineImage({
        profileId,
        file,
      })

      uploadingCountRef.current = Math.max(0, uploadingCountRef.current - 1)

      if (url) {
        const { state } = editor
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === tempUrl) {
            editor.chain().setNodeSelection(pos).setImage({ src: url }).run()
          }
        })
        URL.revokeObjectURL(tempUrl)
      } else {
        // 업로드 실패: 임시 이미지 제거
        const { state } = editor
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === tempUrl) {
            editor.chain().setNodeSelection(pos).deleteSelection().run()
          }
        })
        URL.revokeObjectURL(tempUrl)
        if (typeof window !== 'undefined') {
          window.alert(error || '이미지 업로드에 실패했습니다.')
        }
      }
    },
    [editor, profileId]
  )

  // ref에 최신 함수 보관 (editorProps 클로저가 stale해지지 않도록)
  useEffect(() => {
    uploadAndInsertRef.current = uploadAndInsert
  }, [uploadAndInsert])

  const handleImageButton = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) uploadAndInsert(file)
    e.target.value = ''
  }

  if (!editor) {
    return (
      <div className="border border-at-border rounded-xl min-h-[300px] flex items-center justify-center text-at-text-weak text-sm">
        에디터 로딩 중...
      </div>
    )
  }

  const btnBase =
    'p-1.5 rounded transition-colors text-at-text-secondary hover:bg-at-surface-hover disabled:opacity-40 disabled:cursor-not-allowed'
  const btnActive = 'bg-at-accent-light text-at-accent hover:bg-at-accent-light'

  return (
    <div className="border border-at-border rounded-xl bg-white">
      {/* 툴바 */}
      <div className="flex items-center gap-1 border-b border-at-border px-2 py-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btnBase} ${editor.isActive('bold') ? btnActive : ''}`}
          title="굵게 (Cmd/Ctrl+B)"
          aria-label="굵게"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btnBase} ${editor.isActive('italic') ? btnActive : ''}`}
          title="기울임 (Cmd/Ctrl+I)"
          aria-label="기울임"
        >
          <Italic className="w-4 h-4" />
        </button>
        <span className="w-px h-5 bg-at-border mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${btnBase} ${editor.isActive('bulletList') ? btnActive : ''}`}
          title="글머리 기호 목록"
          aria-label="글머리 기호 목록"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${btnBase} ${editor.isActive('orderedList') ? btnActive : ''}`}
          title="번호 매기기 목록"
          aria-label="번호 매기기 목록"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <span className="w-px h-5 bg-at-border mx-1" />
        <label
          className={`${btnBase} cursor-pointer flex items-center`}
          title="이미지 삽입"
          aria-label="이미지 삽입"
        >
          <ImageIcon className="w-4 h-4" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageButton}
          />
        </label>
        <span className="ml-auto text-[11px] text-at-text-weak hidden sm:inline">
          이미지는 Cmd/Ctrl+V 또는 드래그로 삽입
        </span>
      </div>

      {/* 본문 */}
      <EditorContent editor={editor} />
    </div>
  )
}
