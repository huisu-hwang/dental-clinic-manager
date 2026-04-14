// ============================================
// 임상 사진 편집 Canvas 유틸리티
// 밝기/대비/회전/반전 + 일괄 정규화
// ============================================

export interface ImageTransforms {
  brightness: number  // -100 ~ +100 (0 = 원본)
  contrast: number    // -100 ~ +100 (0 = 원본)
  rotation: number    // 각도 (0, 90, 180, 270 또는 미세)
  flipH: boolean      // 좌우 반전
  flipV: boolean      // 상하 반전
}

export const DEFAULT_TRANSFORMS: ImageTransforms = {
  brightness: 0,
  contrast: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
}

// ─── File → HTMLImageElement 로딩 ───

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지 로드 실패'))
    }
    img.src = url
  })
}

// ─── URL → HTMLImageElement 로딩 (CORS 없이 img.src 방식) ───

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = url
  })
}

// ─── Canvas에 변환 적용 후 렌더링 ───

export function renderToCanvas(
  img: HTMLImageElement,
  transforms: ImageTransforms,
  canvas: HTMLCanvasElement
): void {
  const rad = (transforms.rotation * Math.PI) / 180
  const absSin = Math.abs(Math.sin(rad))
  const absCos = Math.abs(Math.cos(rad))

  // 회전 후 캔버스 크기 계산
  const w = Math.round(img.width * absCos + img.height * absSin)
  const h = Math.round(img.width * absSin + img.height * absCos)

  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')!

  // CSS filter로 밝기/대비 적용
  const brightnessVal = 1 + transforms.brightness / 100
  const contrastVal = 1 + transforms.contrast / 100
  ctx.filter = `brightness(${brightnessVal}) contrast(${contrastVal})`

  // 변환 적용
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(rad)
  ctx.scale(transforms.flipH ? -1 : 1, transforms.flipV ? -1 : 1)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  ctx.restore()
}

// ─── 미리보기용 축소 렌더링 ───

export function renderPreview(
  img: HTMLImageElement,
  transforms: ImageTransforms,
  canvas: HTMLCanvasElement,
  maxWidth: number = 800
): void {
  // 미리보기용으로 이미지 크기 제한
  const scale = img.width > maxWidth ? maxWidth / img.width : 1
  const scaledImg = {
    width: Math.round(img.width * scale),
    height: Math.round(img.height * scale),
  }

  const rad = (transforms.rotation * Math.PI) / 180
  const absSin = Math.abs(Math.sin(rad))
  const absCos = Math.abs(Math.cos(rad))

  const w = Math.round(scaledImg.width * absCos + scaledImg.height * absSin)
  const h = Math.round(scaledImg.width * absSin + scaledImg.height * absCos)

  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')!

  const brightnessVal = 1 + transforms.brightness / 100
  const contrastVal = 1 + transforms.contrast / 100
  ctx.filter = `brightness(${brightnessVal}) contrast(${contrastVal})`

  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(rad)
  ctx.scale(
    (transforms.flipH ? -1 : 1) * scale,
    (transforms.flipV ? -1 : 1) * scale
  )
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  ctx.restore()
}

// ─── 변환 적용 → 새 File 반환 ───

export function applyImageTransforms(
  img: HTMLImageElement,
  transforms: ImageTransforms
): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    renderToCanvas(img, transforms, canvas)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(new File([blob], 'edited.jpg', { type: 'image/jpeg' }))
        } else {
          // 폴백: 원본 크기의 빈 파일 (발생하지 않아야 함)
          resolve(new File([], 'edited.jpg', { type: 'image/jpeg' }))
        }
      },
      'image/jpeg',
      0.85
    )
  })
}

// ─── 평균 밝기(luminance) 계산 ───

export function computeAverageLuminance(
  img: HTMLImageElement,
  sampleWidth: number = 200
): number {
  const canvas = document.createElement('canvas')
  const scale = img.width > sampleWidth ? sampleWidth / img.width : 1
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  let totalL = 0
  const pixelCount = data.length / 4

  for (let i = 0; i < data.length; i += 4) {
    totalL += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  return totalL / pixelCount // 0~255 범위
}

// ─── 일괄 정규화: 전체 사진 밝기/대비 통일 ───

export function computeBatchNormalization(
  photos: { id: string; image: HTMLImageElement }[]
): Map<string, { brightness: number; contrast: number }> {
  const result = new Map<string, { brightness: number; contrast: number }>()

  if (photos.length <= 1) return result

  // 각 사진의 평균 밝기 계산
  const luminances: { id: string; luminance: number }[] = photos.map((p) => ({
    id: p.id,
    luminance: computeAverageLuminance(p.image),
  }))

  // 전체 평균 밝기
  const targetLuminance =
    luminances.reduce((sum, l) => sum + l.luminance, 0) / luminances.length

  // 각 사진별 보정값 계산
  for (const { id, luminance } of luminances) {
    const diff = targetLuminance - luminance
    // luminance diff (0~255 범위)를 brightness 슬라이더 값 (-100~+100)으로 매핑
    // 255 차이 = ±100 이므로 diff / 255 * 100
    const brightness = Math.round(Math.max(-100, Math.min(100, (diff / 255) * 100)))
    result.set(id, { brightness, contrast: 0 })
  }

  return result
}
