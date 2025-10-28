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
            <div className="absolute top-12 left-0 bg-white border border-slate-300 rounded-lg shadow-lg p-3 z-20">
              <div className="grid grid-cols-6 gap-2 mb-2">
                {[
                  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC',
                  '#D33115', '#E27300', '#FFC107', '#16A765', '#2196F3', '#9C27B0',
                  '#EA1E63', '#FF5722', '#FDD835', '#7CB342', '#00ACC1', '#5E35B1',
                  '#F06292', '#FF8A65', '#FFF176', '#AED581', '#4DD0E1', '#9575CD'
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setColor(color).run()
                      setShowColorPicker(false)
                    }}
                    className="w-6 h-6 rounded border border-slate-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run()
                  setShowColorPicker(false)
                }}
                className="w-full px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
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