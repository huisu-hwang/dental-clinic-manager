import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// 플랫폼별 이미지 규격
const PLATFORM_SPECS = {
    naverBlog: { width: 860, height: null, label: '네이버 블로그' }, // 가로 고정, 세로 비율 유지
    instagramSquare: { width: 1080, height: 1080, label: '인스타 1:1' },
    instagramPortrait: { width: 1080, height: 1350, label: '인스타 4:5' },
    facebook: { width: 1200, height: 630, label: '페이스북 OG' },
    threads: { width: 1080, height: 1080, label: '쓰레드 1:1' },
};
/**
 * 원본 이미지를 플랫폼별 규격으로 변환
 */
export async function processImageForPlatforms(inputPath, fileName, platforms) {
    const results = [];
    const tempDir = path.join(os.tmpdir(), 'marketing-images', 'processed');
    await fs.mkdir(tempDir, { recursive: true });
    for (const platform of platforms) {
        try {
            const spec = PLATFORM_SPECS[platform];
            const outputName = `${path.parse(fileName).name}_${platform}${path.extname(fileName)}`;
            const outputPath = path.join(tempDir, outputName);
            if (spec.height === null) {
                // 가로 고정, 세로 비율 유지 (블로그)
                await sharp(inputPath)
                    .resize(spec.width, undefined, { fit: 'inside', withoutEnlargement: true })
                    .png({ quality: 90 })
                    .toFile(outputPath);
            }
            else {
                // 고정 크기 크롭 (SNS)
                await sharp(inputPath)
                    .resize(spec.width, spec.height, { fit: 'cover', position: 'centre' })
                    .png({ quality: 90 })
                    .toFile(outputPath);
            }
            const metadata = await sharp(outputPath).metadata();
            results.push({
                platform,
                filePath: outputPath,
                fileName: outputName,
                width: metadata.width || spec.width,
                height: metadata.height || spec.height || 0,
            });
        }
        catch (error) {
            console.error(`[ImageProcessor] ${platform} 변환 실패:`, error);
        }
    }
    return results;
}
/**
 * 임상 사진 환자 얼굴 영역 모자이크 처리
 * (간단 구현: 상단 1/3 영역 블러)
 */
export async function anonymizePhoto(inputPath) {
    const tempDir = path.join(os.tmpdir(), 'marketing-images', 'anonymized');
    await fs.mkdir(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `anon_${path.basename(inputPath)}`);
    const metadata = await sharp(inputPath).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    // 상단 1/3 영역을 강하게 블러 처리
    const blurHeight = Math.round(height / 3);
    // 원본 이미지 로드
    const original = sharp(inputPath);
    // 블러 처리된 상단 영역 생성
    const blurredTop = await sharp(inputPath)
        .extract({ left: 0, top: 0, width, height: blurHeight })
        .blur(30)
        .toBuffer();
    // 합성
    await original
        .composite([
        {
            input: blurredTop,
            top: 0,
            left: 0,
        },
    ])
        .toFile(outputPath);
    return outputPath;
}
/**
 * 병원 로고 워터마크 삽입
 */
export async function addWatermark(inputPath, logoPath) {
    const tempDir = path.join(os.tmpdir(), 'marketing-images', 'watermarked');
    await fs.mkdir(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `wm_${path.basename(inputPath)}`);
    const metadata = await sharp(inputPath).metadata();
    const width = metadata.width || 800;
    // 로고를 이미지 너비의 15%로 리사이즈
    const logoWidth = Math.round(width * 0.15);
    const resizedLogo = await sharp(logoPath)
        .resize(logoWidth, undefined, { fit: 'inside' })
        .ensureAlpha(0.5) // 반투명
        .toBuffer();
    const logoMeta = await sharp(resizedLogo).metadata();
    const logoHeight = logoMeta.height || 50;
    // 우하단에 배치
    await sharp(inputPath)
        .composite([
        {
            input: resizedLogo,
            top: (metadata.height || 600) - logoHeight - 20,
            left: width - logoWidth - 20,
        },
    ])
        .toFile(outputPath);
    return outputPath;
}
/**
 * 밝기/대비 자동 보정 (임상 사진용)
 */
export async function autoCorrectPhoto(inputPath) {
    const tempDir = path.join(os.tmpdir(), 'marketing-images', 'corrected');
    await fs.mkdir(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `corrected_${path.basename(inputPath)}`);
    await sharp(inputPath)
        .normalize() // 자동 레벨 보정
        .sharpen({ sigma: 1.0 }) // 약간의 샤프닝
        .toFile(outputPath);
    return outputPath;
}
