// ============================================
// 임상 사진 편집 Canvas 유틸리티
// 밝기/대비/회전/반전 + 치은 기준 일괄 정규화
// ============================================

export interface ImageTransforms {
  brightness: number  // -100 ~ +100 (0 = 원본)
  contrast: number    // -100 ~ +100 (0 = 원본)
  rotation: number    // 각도 (0, 90, 180, 270 또는 미세)
  flipH: boolean      // 좌우 반전
  flipV: boolean      // 상하 반전
  hueRotate?: number  // 색조 회전 (도, -180 ~ +180)
  saturate?: number   // 채도 배율 (0.5 ~ 1.5, 1 = 원본)
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

// ─── CSS 필터 문자열 생성 ───

function buildFilterString(transforms: ImageTransforms): string {
  const filters: string[] = []
  const brightnessVal = 1 + transforms.brightness / 100
  const contrastVal = 1 + transforms.contrast / 100
  filters.push(`brightness(${brightnessVal})`)
  filters.push(`contrast(${contrastVal})`)
  if (transforms.hueRotate) {
    filters.push(`hue-rotate(${transforms.hueRotate}deg)`)
  }
  if (transforms.saturate !== undefined && transforms.saturate !== 1) {
    filters.push(`saturate(${transforms.saturate})`)
  }
  return filters.join(' ')
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
  ctx.filter = buildFilterString(transforms)

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
  ctx.filter = buildFilterString(transforms)

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

// ─── RGB → HSL 변환 ───

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return [h * 360, s * 100, l * 100] // [Hue 0-360, Sat 0-100, Lit 0-100]
}

// ─── 치은(잇몸) 픽셀 판별 (RGB 채널 비교 방식) ───
// HSL 범위 기반 감지 대신 RGB 상대 비교를 사용.
// 밝기/대비 편집 후에도 "빨간 채널이 지배적"인 속성은 유지됨.
//
// 조건:
// 1. 순흑/순백 제외 (lum 25~245)
// 2. 빨간 채널이 초록·파랑보다 커야 함
// 3. 빨간 채널 우세량이 충분해야 함 (너무 회색이면 제외)
// 4. 파랑 채널이 초록보다 지나치게 낮으면 주황(retractor 등)으로 간주하여 제외

function isGingivaPixel(r: number, g: number, b: number): boolean {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum < 25 || lum > 245) return false   // 순흑·순백 제외
  if (r <= g || r <= b) return false         // 빨간 채널이 지배적이어야 함
  if (r - g < 8 || r - b < 6) return false  // 최소 붉은 기 요구
  if (b < g - 25) return false               // 너무 주황색 (치아 색조 등) 제외
  return true
}

// ─── 치은 색 통계 추출 ───

interface GingivaStats {
  avgHue: number        // 0-360 (원형 평균)
  avgSaturation: number // 0-100
  avgLightness: number  // 0-100
  pixelCount: number    // 감지된 치은 픽셀 수
}

export function extractGingivaStats(
  img: HTMLImageElement,
  sampleWidth: number = 300
): GingivaStats {
  const canvas = document.createElement('canvas')
  const scale = img.width > sampleWidth ? sampleWidth / img.width : 1
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // 원형 평균(circular mean) 계산을 위한 sin/cos 누적
  let totalHSin = 0
  let totalHCos = 0
  let totalS = 0
  let totalL = 0
  let count = 0

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (isGingivaPixel(r, g, b)) {
      const [h, s, l] = rgbToHsl(r, g, b)
      const hRad = (h * Math.PI) / 180
      totalHSin += Math.sin(hRad)
      totalHCos += Math.cos(hRad)
      totalS += s
      totalL += l
      count++
    }
  }

  if (count === 0) {
    return { avgHue: 0, avgSaturation: 0, avgLightness: 0, pixelCount: 0 }
  }

  // Hue의 원형 평균 (0° 경계를 올바르게 처리)
  let avgHue = (Math.atan2(totalHSin / count, totalHCos / count) * 180) / Math.PI
  if (avgHue < 0) avgHue += 360

  return {
    avgHue,
    avgSaturation: totalS / count,
    avgLightness: totalL / count,
    pixelCount: count,
  }
}

// ─── 평균 밝기(luminance) 계산 (폴백용) ───

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

// ─── 각도 차이 (최단 경로, -180 ~ +180) ───

function angleDiff(target: number, current: number): number {
  let diff = target - current
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return diff
}

// ─── 일괄 정규화: 치은 색 기준 밝기/색조/채도 통일 ───

export interface NormalizationAdjustment {
  brightness: number  // -50 ~ +50
  contrast: number    // 항상 0
  hueRotate: number   // -30 ~ +30 (도)
  saturate: number    // 0.5 ~ 1.5 (배율)
}

export function computeBatchNormalization(
  photos: { id: string; image: HTMLImageElement }[]
): Map<string, NormalizationAdjustment> {
  const result = new Map<string, NormalizationAdjustment>()

  if (photos.length <= 1) return result

  // 각 사진의 치은 색 통계 추출
  const stats = photos.map((p) => ({
    id: p.id,
    gingiva: extractGingivaStats(p.image),
  }))

  // 치은이 감지된 사진만 필터링
  const withGingiva = stats.filter((s) => s.gingiva.pixelCount > 0)

  // 치은이 감지된 사진이 2장 미만이면 → 전체 밝기 기반 폴백
  if (withGingiva.length < 2) {
    const luminances = photos.map((p) => ({
      id: p.id,
      luminance: computeAverageLuminance(p.image),
    }))
    const targetLuminance =
      luminances.reduce((sum, l) => sum + l.luminance, 0) / luminances.length

    for (const { id, luminance } of luminances) {
      const diff = targetLuminance - luminance
      const brightness = Math.round(Math.max(-50, Math.min(50, (diff / 255) * 100)))
      result.set(id, { brightness, contrast: 0, hueRotate: 0, saturate: 1 })
    }
    return result
  }

  // ─── 치은 기준 목표값 계산 ───

  // Hue 원형 평균
  let targetHSin = 0
  let targetHCos = 0
  let targetS = 0
  let targetL = 0
  for (const { gingiva } of withGingiva) {
    const hRad = (gingiva.avgHue * Math.PI) / 180
    targetHSin += Math.sin(hRad)
    targetHCos += Math.cos(hRad)
    targetS += gingiva.avgSaturation
    targetL += gingiva.avgLightness
  }
  let targetHue =
    (Math.atan2(targetHSin / withGingiva.length, targetHCos / withGingiva.length) * 180) /
    Math.PI
  if (targetHue < 0) targetHue += 360
  const targetSat = targetS / withGingiva.length
  const targetLit = targetL / withGingiva.length

  // ─── 각 사진별 보정값 계산 ───

  for (const { id, gingiva } of stats) {
    // 치은이 감지되지 않은 사진은 밝기만 보정 (폴백)
    if (gingiva.pixelCount === 0) {
      const img = photos.find((p) => p.id === id)!.image
      const lum = computeAverageLuminance(img)
      const targetLum =
        stats
          .filter((s) => s.gingiva.pixelCount > 0)
          .reduce((sum, s) => sum + computeAverageLuminance(photos.find((p) => p.id === s.id)!.image), 0) /
        withGingiva.length
      const diff = targetLum - lum
      result.set(id, {
        brightness: Math.round(Math.max(-50, Math.min(50, (diff / 255) * 100))),
        contrast: 0,
        hueRotate: 0,
        saturate: 1,
      })
      continue
    }

    // 밝기: 치은 Lightness 차이 기반
    const litDiff = targetLit - gingiva.avgLightness
    const brightness = Math.round(Math.max(-50, Math.min(50, litDiff * 1.2)))

    // 색조: 치은 Hue 차이 기반 (최단 각도 경로)
    const hueDiff = angleDiff(targetHue, gingiva.avgHue)
    const hueRotate = Math.round(Math.max(-30, Math.min(30, hueDiff)))

    // 채도: 치은 Saturation 비율 기반
    let saturate = 1
    if (gingiva.avgSaturation > 3) {
      saturate = targetSat / gingiva.avgSaturation
      saturate = Math.max(0.6, Math.min(1.5, saturate))
      // 미세한 차이는 무시 (±5% 이내)
      if (Math.abs(saturate - 1) < 0.05) saturate = 1
    }

    result.set(id, { brightness, contrast: 0, hueRotate, saturate })
  }

  return result
}
