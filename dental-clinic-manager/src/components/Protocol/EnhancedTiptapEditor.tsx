'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { useCallback, useEffect, useState } from 'react'

import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import ListItem from '@tiptap/extension-list-item'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import { useDropzone } from 'react-dropzone'
import { mediaService } from '@/lib/mediaService'
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
  CodeBracketIcon,
  PhotoIcon,
  VideoCameraIcon,
  TableCellsIcon,
  ExclamationTriangleIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon
} from '@heroicons/react/24/outline'

interface EnhancedTiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  editable?: boolean
  onImageUpload?: (url: string) => void
}

const isBrowser = typeof window !== 'undefined'

const SAFE_STYLE_PROPERTIES = new Set<string>([
  'color',
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-collapse',
  'border-spacing',
  'box-sizing',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'font-stretch',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-type',
  'list-style-image',
  'list-style-position',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'text-indent',
  'text-transform',
  'text-shadow',
  'text-overflow',
  'text-wrap',
  'white-space',
  'word-break',
  'word-spacing',
  'background-clip',
  'background-origin',
  'display',
  'float',
  'clear',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'vertical-align',
  'overflow',
  'overflow-x',
  'overflow-y',
  'opacity',
  'gap',
  'align-items',
  'justify-content'
])

const FONT_SIZE_MAP: Record<string, string> = {
  '1': '0.75rem',
  '2': '0.875rem',
  '3': '1rem',
  '4': '1.125rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '2rem'
}

const isValidCssColor = (value: string) => {
  if (!isBrowser || !value) {
    return false
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', trimmed)
  }

  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)
}

const parseStyleString = (style?: string | null) => {
  const styleObject: Record<string, string> = {}
  if (!style) {
    return styleObject
  }

  style
    .split(';')
    .map(rule => rule.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const [property, ...valueParts] = declaration.split(':')
      if (!property || valueParts.length === 0) {
        return
      }
      const propertyName = property.trim().toLowerCase()
      const value = valueParts.join(':').trim()
      if (!propertyName || !value) {
        return
      }
      styleObject[propertyName] = value
    })

  return styleObject
}

const stringifyStyleObject = (styleObject: Record<string, string>) =>
  Object.entries(styleObject)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ')

const mergeStyleStrings = (...styles: (string | null | undefined)[]) => {
  const merged: Record<string, string> = {}

  styles
    .filter((style): style is string => Boolean(style && style.trim()))
    .forEach((style) => {
      const styleObject = parseStyleString(style)
      Object.entries(styleObject).forEach(([property, value]) => {
        if (!SAFE_STYLE_PROPERTIES.size || SAFE_STYLE_PROPERTIES.has(property)) {
          merged[property] = value
        }
      })
    })

  return stringifyStyleObject(merged)
}

const mapFontSizeValue = (value?: string | null) => {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (FONT_SIZE_MAP[normalized]) {
    return FONT_SIZE_MAP[normalized]
  }

  if (/^\d+(px|pt|em|rem|%)$/i.test(normalized)) {
    return normalized
  }

  const numericValue = Number(normalized)
  if (!Number.isNaN(numericValue) && numericValue > 0) {
    return `${numericValue}px`
  }

  return null
}

const extractClassStyleMap = (doc: Document) => {
  const classStyleMap: Record<string, string> = {}
  let removed = false

  doc.querySelectorAll('style').forEach((styleTag) => {
    const styleContent = styleTag.textContent ?? ''
    const ruleRegex = /([^\{]+)\{([^}]*)\}/g
    let match: RegExpExecArray | null

    while ((match = ruleRegex.exec(styleContent)) !== null) {
      const selectors = match[1]
        .split(',')
        .map(selector => selector.trim())
        .filter(Boolean)

      selectors.forEach((selector) => {
        if (!selector.startsWith('.')) {
          return
        }
        const className = selector.slice(1)
        const declarations = mergeStyleStrings(match[2])
        if (className && declarations) {
          classStyleMap[className] = declarations
        }
      })
    }

    styleTag.remove()
    removed = true
  })

  return { classStyleMap, removed }
}

const normalizeClipboardHtml = (html: string): string | null => {
  if (!isBrowser || !html) {
    return null
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  if (!body) {
    return null
  }

  let mutated = false

  body.querySelectorAll('font').forEach((fontNode) => {
    const span = doc.createElement('span')
    while (fontNode.firstChild) {
      span.appendChild(fontNode.firstChild)
    }

    const styleParts: string[] = []
    const inlineStyle = fontNode.getAttribute('style')?.trim()
    if (inlineStyle) {
      styleParts.push(inlineStyle)
    }

    const colorValue = fontNode.getAttribute('color')?.trim()
    if (colorValue && isValidCssColor(colorValue)) {
      styleParts.unshift(`color: ${colorValue}`)
    }

    const fontFace = fontNode.getAttribute('face')?.trim()
    if (fontFace) {
      styleParts.push(`font-family: ${fontFace}`)
    }

    const fontSize = mapFontSizeValue(fontNode.getAttribute('size'))
    if (fontSize) {
      styleParts.push(`font-size: ${fontSize}`)
    }

    const mergedStyle = mergeStyleStrings(...styleParts)
    if (mergedStyle) {
      span.setAttribute('style', mergedStyle)
    }

    fontNode.replaceWith(span)
    mutated = true
  })

  const { classStyleMap, removed } = extractClassStyleMap(doc)
  if (removed) {
    mutated = true
  }

  if (Object.keys(classStyleMap).length > 0) {
    body.querySelectorAll<HTMLElement>('[class]').forEach((node) => {
      const classAttr = node.getAttribute('class')
      if (!classAttr) {
        return
      }

      const classes = classAttr.split(/\s+/).filter(Boolean)
      if (classes.length === 0) {
        node.removeAttribute('class')
        return
      }

      const inheritedStyles = classes
        .map(cls => classStyleMap[cls])
        .filter((style): style is string => Boolean(style))

      if (inheritedStyles.length > 0) {
        const mergedStyle = mergeStyleStrings(...inheritedStyles, node.getAttribute('style'))
        if (mergedStyle) {
          node.setAttribute('style', mergedStyle)
          mutated = true
        }
      }

      const remainingClasses = classes.filter(cls => !classStyleMap[cls])
      if (remainingClasses.length > 0) {
        node.setAttribute('class', remainingClasses.join(' '))
      } else {
        node.removeAttribute('class')
      }
    })
  }

  body.querySelectorAll<HTMLElement>('*').forEach((node) => {
    const colorAttribute = node.getAttribute('color')?.trim()
    if (colorAttribute && isValidCssColor(colorAttribute)) {
      const mergedStyle = mergeStyleStrings(`color: ${colorAttribute}`, node.getAttribute('style'))
      if (mergedStyle) {
        node.setAttribute('style', mergedStyle)
      }
      node.removeAttribute('color')
      mutated = true
    }

    const backgroundAttribute = node.getAttribute('bgcolor')?.trim()
    if (backgroundAttribute && isValidCssColor(backgroundAttribute)) {
      const mergedStyle = mergeStyleStrings(`background-color: ${backgroundAttribute}`, node.getAttribute('style'))
      if (mergedStyle) {
        node.setAttribute('style', mergedStyle)
      }
      node.removeAttribute('bgcolor')
      mutated = true
    }

    const existingStyle = node.getAttribute('style')
    if (existingStyle) {
      const sanitizedStyle = mergeStyleStrings(existingStyle)
      if (sanitizedStyle) {
        if (sanitizedStyle !== existingStyle) {
          node.setAttribute('style', sanitizedStyle)
          mutated = true
        }
      } else {
        node.removeAttribute('style')
        mutated = true
      }
    }
  })

  return mutated ? body.innerHTML : null
}

export default function EnhancedTiptapEditor({
  content,
  onChange,
  placeholder = '프로토콜 내용을 작성하세요...',
  editable = true,
  onImageUpload
}: EnhancedTiptapEditorProps) {
  // 색상 팔레트 표시 상태
  const [showColorPicker, setShowColorPicker] = useState(false)

  // Tiptap Editor 설정
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Disable default heading
        bulletList: false,
        orderedList: false,
        listItem: false
      }),
      Heading.configure({
        levels: [1, 2, 3],
        HTMLAttributes: {
          class: 'protocol-heading'
        }
      }),
      TextStyle,
      Color,
      ListItem.configure({
        HTMLAttributes: {
          class: 'protocol-list-item'
        }
      }),
      BulletList.configure({
        keepMarks: true,
        HTMLAttributes: {
          class: 'protocol-bullet-list list-disc pl-6'
        }
      }),
      OrderedList.configure({
        keepMarks: true,
        HTMLAttributes: {
          class: 'protocol-ordered-list list-decimal pl-6'
        }
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left'
      }),
      Image.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: 'protocol-image rounded-lg max-w-full h-auto'
        }
      }),
      Youtube.configure({
        width: 640,
        height: 360,
        allowFullscreen: true,
        HTMLAttributes: {
          class: 'youtube-video rounded-lg'
        }
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'protocol-table border-collapse border border-slate-300'
        }
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border border-slate-300'
        }
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 bg-slate-100 p-2 font-bold text-left'
        }
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 p-2'
        }
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'flex items-start gap-2'
        }
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty'
      })
    ],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-6 text-left protocol-editor-content'
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file.type.startsWith('image/')) {
            handleImageUpload(file)
            return true
          }
        }
        return false
      },
      handlePaste: (view, event, _slice) => {
        const items = event.clipboardData?.items
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (file) {
                handleImageUpload(file)
                return true
              }
            }
          }
        }

        const html = event.clipboardData?.getData('text/html')
        const normalizedHtml = html ? normalizeClipboardHtml(html) : null

        if (normalizedHtml && editor) {
          event.preventDefault()
          editor.chain().focus().insertContent(normalizedHtml).run()
          return true
        }

        return false
      },
      handleKeyDown: (view, event) => {
        // Tab 키 처리 (리스트 들여쓰기)
        if (event.key === 'Tab' && editor) {
          event.preventDefault()

          const { state } = editor
          const { selection } = state
          const { $from } = selection

          // 리스트 아이템 안에 있는지 확인
          const inList = $from.node(-2)?.type.name === 'bulletList' ||
                         $from.node(-2)?.type.name === 'orderedList' ||
                         $from.node(-1)?.type.name === 'bulletList' ||
                         $from.node(-1)?.type.name === 'orderedList'

          if (inList) {
            if (event.shiftKey) {
              // Shift+Tab: 내어쓰기 (lift)
              editor.chain().focus().liftListItem('listItem').run()
            } else {
              // Tab: 들여쓰기 (sink)
              editor.chain().focus().sinkListItem('listItem').run()
            }
            return true
          }
        }
        return false
      }
    }
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  // 이미지 업로드 핸들러
  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return

    console.log('[Editor] Uploading image:', file.name)

    // 로딩 표시 (임시 이미지)
    const tempUrl = URL.createObjectURL(file)
    editor.chain().focus().setImage({ src: tempUrl }).run()

    // 실제 업로드
    const result = await mediaService.uploadProtocolImage(file)
    const uploadedUrl = result.url

    if (uploadedUrl) {
      // 임시 이미지를 실제 URL로 교체
      const { state } = editor
      const { doc } = state
      doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.src === tempUrl) {
          editor.chain().setNodeSelection(pos).setImage({ src: uploadedUrl }).run()
        }
      })

      // Callback 실행
      onImageUpload?.(uploadedUrl)
      console.log('[Editor] Image uploaded successfully:', uploadedUrl)
    } else {
      // 업로드 실패 시 임시 이미지 제거
      alert(result.error || '이미지 업로드에 실패했습니다.')
      const { state } = editor
      const { doc } = state
      doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.src === tempUrl) {
          editor.chain().setNodeSelection(pos).deleteSelection().run()
        }
      })
    }

    URL.revokeObjectURL(tempUrl)
  }, [editor, onImageUpload])

  // 파일 드롭존 설정
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const imageFile = acceptedFiles.find(file => file.type.startsWith('image/'))
      if (imageFile) {
        await handleImageUpload(imageFile)
      }
    },
    noClick: true,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    }
  })

  // YouTube URL 추가
  const addYoutubeVideo = useCallback(() => {
    const url = prompt('YouTube 동영상 URL을 입력하세요:')

    if (url && editor) {
      editor.chain().focus().setYoutubeVideo({
        src: url,
        width: 640,
        height: 360,
      }).run()
    }
  }, [editor])

  // 테이블 추가
  const addTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  // 경고 박스 추가
  const addWarningBox = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertContent(
      '<div class="warning-box bg-yellow-50 border-l-4 border-yellow-400 p-4 my-4">' +
      '<p class="flex items-start"><span class="text-yellow-600 font-bold mr-2">⚠️ 주의:</span>' +
      '<span>여기에 주의사항을 입력하세요.</span></p></div>'
    ).run()
  }, [editor])

  if (!editor) {
    return null
  }

  if (!editable) {
    return (
      <div className="border border-slate-200 rounded-lg bg-white">
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="border border-slate-300 rounded-lg bg-white" {...getRootProps()}>
      {/* 툴바 */}
      <div className="border-b border-slate-300 bg-slate-50 p-3 flex flex-wrap gap-1 sticky top-0 z-10">
        {/* 텍스트 서식 */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-slate-200 transition-colors ${
              editor.isActive('bold') ? 'bg-slate-300' : ''
            }`}
            title="굵게"
          >
            <BoldIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-slate-200 transition-colors ${
              editor.isActive('italic') ? 'bg-slate-300' : ''
            }`}
            title="기울임"
          >
            <ItalicIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-2 rounded hover:bg-slate-200 transition-colors ${
              editor.isActive('code') ? 'bg-slate-300' : ''
            }`}
            title="코드"
          >
            <CodeBracketIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="w-px h-8 bg-slate-300" />

        {/* 텍스트 색상 */}
        <div className="relative flex gap-1">
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-2 rounded hover:bg-slate-200 transition-colors relative"
            title="글자 색"
          >
            <span className="text-sm font-bold">A</span>
            <span
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded"
              style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }}
            />
          </button>

          {showColorPicker && (
            <div className="absolute top-12 left-0 bg-white border border-slate-300 rounded-lg shadow-lg p-3 z-20 min-w-[200px]">
              <div className="text-xs text-slate-600 mb-2 font-medium">기본 색상</div>
              <div className="flex gap-2 mb-3">
                {[
                  { color: '#000000', name: '검정' },
                  { color: '#FFFF00', name: '노랑' },
                  { color: '#FF0000', name: '빨강' },
                  { color: '#0000FF', name: '파랑' },
                  { color: '#00FF00', name: '초록' }
                ].map(({ color, name }) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setColor(color).run()
                      setShowColorPicker(false)
                    }}
                    className="w-8 h-8 rounded border-2 border-slate-300 hover:scale-110 hover:border-slate-500 transition-all"
                    style={{ backgroundColor: color }}
                    title={name}
                  />
                ))}
              </div>

              <div className="border-t border-slate-200 pt-3 mt-3">
                <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded transition-colors">
                  <input
                    type="color"
                    onChange={(e) => {
                      editor.chain().focus().setColor(e.target.value).run()
                      setShowColorPicker(false)
                    }}
                    className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700">사용자 정의 색상</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run()
                  setShowColorPicker(false)
                }}
                className="w-full mt-3 px-2 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                기본 색상으로 재설정
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-slate-300" />

        {/* 제목 */}
        <div className="flex gap-1">
          {[1, 2, 3].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                // 현재 활성 상태인 헤딩 레벨이면 일반 텍스트로 전환, 아니면 해당 헤딩 레벨로 설정
                if (editor.isActive('heading', { level })) {
                  editor.chain().focus().setParagraph().run()
                } else {
                  editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run()
                }
              }}
              className={`px-3 py-2 rounded hover:bg-slate-200 text-sm font-semibold transition-colors ${
                editor.isActive('heading', { level }) ? 'bg-slate-300' : ''
              }`}
              title={`제목 ${level}`}
            >
              H{level}
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-slate-300" />

        {/* 리스트 */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-slate-200 transition-colors ${
              editor.isActive('bulletList') ? 'bg-slate-300' : ''
            }`}
            title="글머리 기호"
          >
            <ListBulletIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-slate-200 transition-colors ${
              editor.isActive('orderedList') ? 'bg-slate-300' : ''
            }`}
            title="번호 매기기"
          >
            <NumberedListIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-2 rounded hover:bg-slate-200 transition-colors ${
              editor.isActive('taskList') ? 'bg-slate-300' : ''
            }`}
            title="체크리스트"
          >
            ☐
          </button>
        </div>

        <div className="w-px h-8 bg-slate-300" />

        {/* 미디어 삽입 */}
        <div className="flex gap-1">
          <label className="p-2 rounded hover:bg-slate-200 cursor-pointer transition-colors" title="이미지 삽입">
            <PhotoIcon className="h-4 w-4" />
            <input {...getInputProps()} />
          </label>
          <button
            type="button"
            onClick={addYoutubeVideo}
            className="p-2 rounded hover:bg-slate-200 transition-colors"
            title="YouTube 동영상"
          >
            <VideoCameraIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={addTable}
            className="p-2 rounded hover:bg-slate-200 transition-colors"
            title="표 삽입"
          >
            <TableCellsIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={addWarningBox}
            className="p-2 rounded hover:bg-slate-200 transition-colors"
            title="주의사항 박스"
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="w-px h-8 bg-slate-300" />

        {/* 실행취소/다시실행 */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-2 rounded hover:bg-slate-200 disabled:opacity-50 transition-colors"
            title="실행취소"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-2 rounded hover:bg-slate-200 disabled:opacity-50 transition-colors"
            title="다시실행"
          >
            <ArrowUturnRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 에디터 본문 */}
      <div className={`relative ${isDragActive ? 'bg-blue-50' : ''}`}>
        <EditorContent editor={editor} />
        {isDragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-100 bg-opacity-50 pointer-events-none">
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <PhotoIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-blue-600 font-medium">이미지를 여기에 드롭하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}