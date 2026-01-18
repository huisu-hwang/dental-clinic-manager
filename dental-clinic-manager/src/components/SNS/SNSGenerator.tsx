'use client'

import { useState } from 'react'
import {
  Share2,
  Instagram,
  MessageCircle,
  FileText,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Image as ImageIcon,
  Hash,
  AtSign,
  Smile,
  Calendar,
  Clock,
  AlertCircle
} from 'lucide-react'

// SNS 플랫폼 타입
type Platform = 'instagram' | 'blog' | 'facebook' | 'kakao'

// 글 카테고리 타입
type Category = 'promotion' | 'review' | 'info' | 'event' | 'daily' | 'before_after'

interface CategoryOption {
  id: Category
  label: string
  description: string
  icon: React.ReactNode
}

const PLATFORMS: { id: Platform; label: string; icon: React.ReactNode }[] = [
  { id: 'instagram', label: '인스타그램', icon: <Instagram className="w-5 h-5" /> },
  { id: 'blog', label: '네이버 블로그', icon: <FileText className="w-5 h-5" /> },
  { id: 'facebook', label: '페이스북', icon: <Share2 className="w-5 h-5" /> },
  { id: 'kakao', label: '카카오 채널', icon: <MessageCircle className="w-5 h-5" /> }
]

const CATEGORIES: CategoryOption[] = [
  { id: 'promotion', label: '홍보/마케팅', description: '치과 서비스 홍보 글', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'review', label: '후기/사례', description: '환자 치료 후기 및 사례', icon: <Smile className="w-4 h-4" /> },
  { id: 'info', label: '치과 정보', description: '치아 건강 정보 및 팁', icon: <AlertCircle className="w-4 h-4" /> },
  { id: 'event', label: '이벤트', description: '할인, 이벤트 공지', icon: <Calendar className="w-4 h-4" /> },
  { id: 'daily', label: '일상/소식', description: '병원 일상 및 소식', icon: <Clock className="w-4 h-4" /> },
  { id: 'before_after', label: '비포/애프터', description: '치료 전후 비교', icon: <ImageIcon className="w-4 h-4" /> }
]

// 해시태그 추천
const HASHTAG_SUGGESTIONS: Record<Category, string[]> = {
  promotion: ['#치과', '#치과추천', '#치과할인', '#임플란트', '#치아교정', '#라미네이트', '#치아미백'],
  review: ['#치과후기', '#치료후기', '#환자후기', '#교정후기', '#임플란트후기', '#만족'],
  info: ['#치아건강', '#치아관리', '#구강건강', '#치과상식', '#치아정보', '#올바른양치'],
  event: ['#치과이벤트', '#할인이벤트', '#오픈이벤트', '#연말이벤트', '#신규고객할인'],
  daily: ['#치과일상', '#병원일상', '#치과스태프', '#오늘의치과', '#치과브이로그'],
  before_after: ['#비포애프터', '#치료전후', '#교정전후', '#미백전후', '#라미네이트전후', '#변화']
}

export default function SNSGenerator() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('instagram')
  const [selectedCategory, setSelectedCategory] = useState<Category>('promotion')
  const [topic, setTopic] = useState('')
  const [keywords, setKeywords] = useState('')
  const [generatedContent, setGeneratedContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([])

  // 글 생성 함수 (현재는 템플릿 기반, 추후 AI 연동 가능)
  const generateContent = async () => {
    if (!topic.trim()) {
      alert('주제를 입력해주세요.')
      return
    }

    setIsGenerating(true)

    // 시뮬레이션된 생성 (실제로는 AI API 호출)
    await new Promise(resolve => setTimeout(resolve, 1500))

    const platformEmojis: Record<Platform, string> = {
      instagram: '',
      blog: '',
      facebook: '',
      kakao: ''
    }

    const categoryIntros: Record<Category, string> = {
      promotion: `안녕하세요! 오늘은 ${topic}에 대해 소개해 드릴게요.`,
      review: `${topic} 치료를 받으신 환자분의 솔직한 후기를 공유합니다.`,
      info: `오늘은 ${topic}에 대해 알려드릴게요! 치아 건강에 도움이 되는 정보입니다.`,
      event: `특별한 이벤트 소식! ${topic} 이벤트를 진행합니다.`,
      daily: `오늘 병원에서 있었던 ${topic} 이야기를 나눠볼게요.`,
      before_after: `${topic} 치료 전후 변화를 확인해보세요!`
    }

    const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k)
    const keywordText = keywordList.length > 0 ? `\n\n핵심 포인트: ${keywordList.join(', ')}` : ''

    let content = ''

    if (selectedPlatform === 'instagram') {
      content = `${categoryIntros[selectedCategory]}

${topic}에 대해 자세히 알려드릴게요!
${keywordText}

자세한 상담은 DM 또는 전화로 문의해주세요!

${selectedHashtags.length > 0 ? selectedHashtags.join(' ') : HASHTAG_SUGGESTIONS[selectedCategory].slice(0, 5).join(' ')}`
    } else if (selectedPlatform === 'blog') {
      content = `# ${topic}

${categoryIntros[selectedCategory]}

## 소개
${topic}은(는) 많은 분들이 관심을 가지고 계신 주제입니다.
${keywordText}

## 상세 내용
자세한 내용을 작성해주세요...

## 마무리
궁금하신 점이 있으시면 언제든 문의해주세요!

---
${HASHTAG_SUGGESTIONS[selectedCategory].slice(0, 7).join(' ')}`
    } else if (selectedPlatform === 'facebook') {
      content = `${categoryIntros[selectedCategory]}

${topic}에 대해 많은 분들이 궁금해하셔서 정보를 공유합니다.
${keywordText}

좋아요와 공유 부탁드려요!
문의: 댓글 또는 메시지`
    } else {
      content = `[${CATEGORIES.find(c => c.id === selectedCategory)?.label}]

${categoryIntros[selectedCategory]}
${keywordText}

자세한 내용이 궁금하시면 채팅으로 문의해주세요!`
    }

    setGeneratedContent(content)
    setIsGenerating(false)
  }

  // 클립보드 복사
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // 해시태그 토글
  const toggleHashtag = (tag: string) => {
    setSelectedHashtags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-5 rounded-xl shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">SNS 글 생성</h2>
            <p className="text-purple-100 text-sm">치과 마케팅을 위한 SNS 콘텐츠를 쉽게 만들어보세요</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 입력 섹션 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            콘텐츠 설정
          </h3>

          {/* 플랫폼 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">플랫폼 선택</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PLATFORMS.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    selectedPlatform === platform.id
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  {platform.icon}
                  <span className="text-sm font-medium">{platform.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 카테고리 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">글 유형</label>
            <div className="relative">
              <button
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-300 hover:border-slate-400 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {CATEGORIES.find(c => c.id === selectedCategory)?.icon}
                  <span className="font-medium">{CATEGORIES.find(c => c.id === selectedCategory)?.label}</span>
                  <span className="text-sm text-slate-500">- {CATEGORIES.find(c => c.id === selectedCategory)?.description}</span>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showCategoryDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg">
                  {CATEGORIES.map(category => (
                    <button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category.id)
                        setShowCategoryDropdown(false)
                        setSelectedHashtags([])
                      }}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        selectedCategory === category.id ? 'bg-purple-50' : ''
                      }`}
                    >
                      {category.icon}
                      <div className="text-left">
                        <div className="font-medium">{category.label}</div>
                        <div className="text-sm text-slate-500">{category.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 주제 입력 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <AtSign className="w-4 h-4 inline mr-1" />
              주제
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 임플란트 시술, 치아 미백, 교정 상담 등"
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* 키워드 입력 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Hash className="w-4 h-4 inline mr-1" />
              키워드 (쉼표로 구분)
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="예: 무통, 빠른 회복, 자연스러운 결과"
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* 해시태그 추천 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Hash className="w-4 h-4 inline mr-1" />
              추천 해시태그
            </label>
            <div className="flex flex-wrap gap-2">
              {HASHTAG_SUGGESTIONS[selectedCategory].map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleHashtag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedHashtags.includes(tag)
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            onClick={generateContent}
            disabled={isGenerating || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                글 생성하기
              </>
            )}
          </button>
        </div>

        {/* 결과 섹션 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              생성된 콘텐츠
            </h3>
            {generatedContent && (
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    복사됨!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    복사하기
                  </>
                )}
              </button>
            )}
          </div>

          <div className="min-h-[400px] p-4 bg-slate-50 rounded-lg border border-slate-200">
            {generatedContent ? (
              <pre className="whitespace-pre-wrap text-slate-700 font-sans text-sm leading-relaxed">
                {generatedContent}
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Share2 className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-center">
                  왼쪽에서 설정을 완료하고<br />
                  &apos;글 생성하기&apos; 버튼을 클릭하세요
                </p>
              </div>
            )}
          </div>

          {generatedContent && (
            <div className="flex gap-2">
              <button
                onClick={generateContent}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-purple-300 text-purple-600 font-medium rounded-lg hover:bg-purple-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                다시 생성
              </button>
              <button
                onClick={copyToClipboard}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '복사됨!' : '클립보드에 복사'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 팁 섹션 */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
        <h4 className="font-semibold text-purple-800 mb-3">SNS 마케팅 팁</h4>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-purple-700">
          <li className="flex items-start gap-2">
            <span className="text-purple-500">1.</span>
            인스타그램은 해시태그를 10~15개 정도 사용하면 노출이 좋아집니다.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500">2.</span>
            블로그는 제목에 핵심 키워드를 포함시키세요.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500">3.</span>
            비포/애프터 사진은 환자 동의를 반드시 받으세요.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500">4.</span>
            정기적인 포스팅이 팔로워 유지에 중요합니다.
          </li>
        </ul>
      </div>
    </div>
  )
}
