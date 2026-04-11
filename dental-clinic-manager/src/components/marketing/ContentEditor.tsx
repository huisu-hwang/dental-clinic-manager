'use client'

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useEffect, useCallback, useRef } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { PencilSquareIcon } from '@heroicons/react/24/outline'

// ─── 편집 가능한 이미지 NodeView ───

type ImageMeta = { fileName: string; prompt: string; path?: string }
type OnImageEditFn = (
  index: number,
  img: { fileName: string; prompt: string; path: string }
) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditableImageNodeView({ node, editor, getPos }: any) {
  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const storage = (editor.storage as unknown as Record<string, unknown>).image as {
      images?: ImageMeta[] | null
      onImageEdit?: OnImageEditFn | null
    } | undefined
    const images = storage?.images
    const callback = storage?.onImageEdit
    if (!images || !callback) return

    // 문서 내에서 현재 이미지 노드의 순서(index)를 계산
    const pos = typeof getPos === 'function' ? getPos() : -1
    let index = 0
    if (pos >= 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.state.doc.descendants((n: any, p: number) => {
        if (p >= pos) return false
        if (n.type.name === 'image') index++
        return true
      })
    }

    if (index >= 0 && index < images.length) {
      const img = images[index]
      callback(index, {
        fileName: img.fileName,
        prompt: img.prompt,
        path: img.path || node.attrs.src || '',
      })
    }
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="relative group my-2"
      contentEditable={false}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        className="w-full rounded-xl border border-at-border shadow-sm cursor-pointer block"
        draggable={false}
        onMouseDown={(e) => {
          // ProseMirror 노드 선택/드래그 방지
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          handleEdit(e)
        }}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          // 버튼 클릭이 ProseMirror의 포커스 이동/선택에 가로채지지 않도록
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={handleEdit}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 hover:bg-indigo-50 text-at-text hover:text-indigo-600 rounded-xl shadow-md px-3 py-1.5 text-xs font-medium border border-at-border flex items-center gap-1.5 backdrop-blur-sm z-10"
        title="이미지 프롬프트 편집"
      >
        <PencilSquareIcon className="w-3.5 h-3.5" />
        편집
      </button>
    </NodeViewWrapper>
  )
}

const EditableImage = Image.extend({
  addStorage() {
    return {
      images: null as ImageMeta[] | null,
      onImageEdit: null as OnImageEditFn | null,
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableImageNodeView)
  },
})

// ─── 마크다운 → HTML 변환 ───

function markdownToHtml(
  body: string,
  images?: { fileName: string; prompt: string; path?: string }[]
): string {
  const lines = body.split('\n')
  const htmlParts: string[] = []
  let inList = false
  let listType = ''
  let imageIndex = 0

  const closeList = () => {
    if (inList) {
      htmlParts.push(listType === 'ul' ? '</ul>' : '</ol>')
      inList = false
      listType = ''
    }
  }

  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const formatInline = (text: string) =>
    escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      closeList()
      continue
    }

    // [IMAGE:] 마커
    if (/^\[IMAGE:\s*.+?\]$/.test(trimmed)) {
      closeList()
      const match = trimmed.match(/\[IMAGE:\s*(.+?)\]/)
      const prompt = match ? match[1] : ''
      const img = images?.[imageIndex]
      imageIndex++
      if (img?.path) {
        htmlParts.push(`<img src="${img.path}" alt="${escapeHtml(img.prompt || prompt)}" title="${escapeHtml(img.fileName || prompt)}" />`)
      } else {
        htmlParts.push(`<p style="text-align:center;color:#94a3b8;padding:1rem;border:2px dashed #cbd5e1;border-radius:0.75rem;">[이미지] ${escapeHtml(prompt)}</p>`)
      }
      continue
    }

    // 마크다운 이미지 ![alt](url) - 임상 사진 등
    if (/^!\[.*?\]\(.+?\)$/.test(trimmed)) {
      closeList()
      const imgMatch = trimmed.match(/^!\[(.+?)\]\((.+?)\)$/)
      if (imgMatch) {
        const alt = imgMatch[1]
        const url = imgMatch[2]
        htmlParts.push(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`)
      }
      continue
    }

    // ## 소제목
    if (trimmed.startsWith('### ')) {
      closeList()
      htmlParts.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      closeList()
      htmlParts.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`)
      continue
    }

    // 구분선
    if (/^[-─━]{3,}$/.test(trimmed)) {
      closeList()
      htmlParts.push('<hr />')
      continue
    }

    // 리스트
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        closeList()
        htmlParts.push('<ul>')
        inList = true
        listType = 'ul'
      }
      htmlParts.push(`<li>${formatInline(trimmed.replace(/^[-*]\s+/, ''))}</li>`)
      continue
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        closeList()
        htmlParts.push('<ol>')
        inList = true
        listType = 'ol'
      }
      htmlParts.push(`<li>${formatInline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }

    // 일반 텍스트
    closeList()
    htmlParts.push(`<p>${formatInline(trimmed)}</p>`)
  }

  closeList()
  return htmlParts.join('')
}

// ─── HTML → 마크다운 변환 ───

function htmlToMarkdown(html: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null
  if (!div) return html

  div.innerHTML = html
  const lines: string[] = []

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase()

    switch (tag) {
      case 'h2':
        lines.push(`## ${getInlineText(el)}`)
        lines.push('')
        return ''
      case 'h3':
        lines.push(`### ${getInlineText(el)}`)
        lines.push('')
        return ''
      case 'p': {
        const text = getInlineText(el)
        if (text.startsWith('[이미지]')) return '' // 실패한 이미지 플레이스홀더 무시
        if (text) {
          lines.push(text)
          lines.push('')
        }
        return ''
      }
      case 'img': {
        const src = el.getAttribute('src') || ''
        const alt = el.getAttribute('alt') || el.getAttribute('title') || ''
        // 실제 URL이 있는 이미지 (임상 사진 등)는 마크다운 이미지 형식으로 보존
        if (src && !src.startsWith('data:') && alt !== '') {
          lines.push(`![${alt}](${src})`)
        } else {
          lines.push(`[IMAGE: ${alt}]`)
        }
        lines.push('')
        return ''
      }
      case 'ul':
        for (const li of Array.from(el.children)) {
          lines.push(`- ${getInlineText(li as HTMLElement)}`)
        }
        lines.push('')
        return ''
      case 'ol':
        Array.from(el.children).forEach((li, i) => {
          lines.push(`${i + 1}. ${getInlineText(li as HTMLElement)}`)
        })
        lines.push('')
        return ''
      case 'hr':
        lines.push('---')
        lines.push('')
        return ''
      case 'br':
        return '\n'
      default:
        // 재귀 처리
        for (const child of Array.from(el.childNodes)) {
          processNode(child)
        }
        return ''
    }
  }

  const getInlineText = (el: HTMLElement): string => {
    let text = ''
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || ''
      } else {
        const childEl = child as HTMLElement
        const childTag = childEl.tagName?.toLowerCase()
        if (childTag === 'strong' || childTag === 'b') {
          text += `**${childEl.textContent || ''}**`
        } else if (childTag === 'em' || childTag === 'i') {
          text += `*${childEl.textContent || ''}*`
        } else if (childTag === 'br') {
          text += '\n'
        } else {
          text += childEl.textContent || ''
        }
      }
    }
    return text
  }

  for (const child of Array.from(div.childNodes)) {
    processNode(child)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ─── 에디터 컴포넌트 ───

interface ContentEditorProps {
  body: string
  images?: { fileName: string; prompt: string; path?: string }[]
  onChange: (body: string) => void
  onImageEdit?: (imageIndex: number, currentImage: { fileName: string; prompt: string; path: string }) => void
}

export default function ContentEditor({ body, images, onChange, onImageEdit }: ContentEditorProps) {
  // refs를 사용하여 클릭 핸들러에서 최신 값 참조
  const imagesRef = useRef(images)
  const onImageEditRef = useRef(onImageEdit)
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => { onImageEditRef.current = onImageEdit }, [onImageEdit])

  // NodeView 버튼이 최신 images/onImageEdit을 참조할 수 있도록 editor.storage에 동기화
  // (editor 선언 이후에 실제 동기화는 아래 별도 useEffect에서 수행)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      EditableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'w-full rounded-xl border border-at-border shadow-sm my-2 content-editor-image',
        },
      }),
      Placeholder.configure({
        placeholder: '생성된 글이 여기에 표시됩니다...',
      }),
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] px-4 py-3',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const md = htmlToMarkdown(html)
      onChange(md)
    },
  })

  // NodeView에서 참조할 수 있도록 editor.storage.image에 동기화
  useEffect(() => {
    if (!editor) return
    const storage = (editor.storage as unknown as Record<string, unknown>).image as {
      images?: ImageMeta[] | null
      onImageEdit?: OnImageEditFn | null
    } | undefined
    if (storage) {
      storage.images = images || null
      storage.onImageEdit = onImageEdit || null
    }
  }, [editor, images, onImageEdit])

  // 이미지 클릭 이벤트 핸들러 (DOM 이벤트 사용)
  useEffect(() => {
    if (!editor) return

    const editorDom = editor.view.dom

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'IMG') return

      const currentImages = imagesRef.current
      const callback = onImageEditRef.current
      if (!currentImages || !callback) return

      // 에디터 내 모든 이미지를 순서대로 찾아 클릭된 이미지의 인덱스 결정
      const allImgs = editorDom.querySelectorAll('img')
      const clickedIndex = Array.from(allImgs).indexOf(target as HTMLImageElement)

      if (clickedIndex >= 0 && clickedIndex < currentImages.length) {
        const img = currentImages[clickedIndex]
        callback(clickedIndex, {
          fileName: img.fileName,
          prompt: img.prompt,
          path: img.path || target.getAttribute('src') || '',
        })
      }
    }

    editorDom.addEventListener('click', handleClick)
    return () => editorDom.removeEventListener('click', handleClick)
  }, [editor])

  // body 또는 images가 변경되면 에디터 내용 업데이트
  const updateContent = useCallback(() => {
    if (!editor || !body) return
    const html = markdownToHtml(body, images)
    const currentHtml = editor.getHTML()
    // 불필요한 업데이트 방지 (onChange 루프 방지)
    if (html !== currentHtml) {
      editor.commands.setContent(html, { emitUpdate: false })
    }
  }, [editor, body, images])

  // 최초 로드 또는 외부에서 body 변경 시
  useEffect(() => {
    updateContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, images]) // body 변경은 onChange에서 처리하므로 의존성에서 제외

  if (!editor) return null

  return (
    <div className="border border-at-border rounded-xl overflow-hidden bg-white">
      {/* 간단 툴바 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-at-border bg-at-surface-alt/50 flex-wrap">
        <ToolButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="소제목"
        >
          H2
        </ToolButton>
        <ToolButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="소소제목"
        >
          H3
        </ToolButton>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="굵게"
        >
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="기울임"
        >
          <em>I</em>
        </ToolButton>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="목록"
        >
          •
        </ToolButton>
        <ToolButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="번호 목록"
        >
          1.
        </ToolButton>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolButton
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          ─
        </ToolButton>
      </div>

      {/* 에디터 영역 */}
      <div className="max-h-[600px] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      {/* 에디터 스타일 */}
      <style jsx global>{`
        .ProseMirror h2 {
          font-size: 1.125rem;
          font-weight: 700;
          color: #1e293b;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e2e8f0;
        }
        .ProseMirror h3 {
          font-size: 1rem;
          font-weight: 600;
          color: #1e293b;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror p {
          font-size: 0.875rem;
          line-height: 1.75;
          color: #334155;
          margin-bottom: 0.75rem;
        }
        .ProseMirror img {
          margin: 1rem 0;
        }
        .ProseMirror img.content-editor-image {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .ProseMirror img.content-editor-image:hover {
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.4);
          opacity: 0.92;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror li {
          font-size: 0.875rem;
          line-height: 1.5;
          color: #334155;
          margin-bottom: 0.25rem;
        }
        .ProseMirror hr {
          border-color: #e2e8f0;
          margin: 1rem 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #94a3b8;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-indigo-100 text-indigo-700 font-medium'
          : 'text-at-text hover:bg-at-surface-alt hover:text-at-text'
      }`}
    >
      {children}
    </button>
  )
}
