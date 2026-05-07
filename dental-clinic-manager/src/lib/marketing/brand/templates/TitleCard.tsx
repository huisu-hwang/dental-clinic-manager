import type { BrandAssets } from '@/types/brand';

interface Props {
  assets: BrandAssets;
  copy: string;            // 사용자 입력, 최대 30자 + 1회 개행
  logoDataUrl: string | null;
}

export function TitleCard({ assets, copy, logoDataUrl }: Props) {
  const primary = assets.primary_color;
  const slogan = assets.slogan ?? '';
  const nameKo = assets.name_ko ?? '';
  const nameEn = assets.name_en ?? '';
  const borderWidth = Math.min(60, Math.max(0, Math.round(assets.title_border_width ?? 16)));

  // 30자 + 개행 1회 제한 (스펙 5.5)
  const truncated = copy.length > 31 ? copy.slice(0, 30) + '…' : copy;

  return (
    <div style={{
      width: 1080, height: 1080, display: 'flex',
      background: primary, fontFamily: 'Pretendard',
      padding: borderWidth,
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#FFFFFF', borderRadius: Math.max(0, 24 - Math.round(borderWidth / 2)),
        padding: 60,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* 슬로건 */}
        {slogan && (
          <div style={{
            background: '#1B1B1B', color: '#FFFFFF',
            padding: '14px 32px', borderRadius: 999,
            fontSize: 30, fontWeight: 700, textAlign: 'center',
          }}>
            {slogan}
          </div>
        )}
        {/* 중앙 카피 */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', whiteSpace: 'pre-wrap',
          fontSize: 110, fontWeight: 900, color: '#FBC531',
          textShadow: '4px 4px 0 #1B1B1B',
        }}>
          {truncated || nameKo || ' '}
        </div>
        {/* 영문명 (큰 글씨와 로고 사이) */}
        {nameEn && (
          <div style={{
            fontSize: 28, letterSpacing: 4, color: '#9AA0A6',
            fontFamily: 'Inter', marginBottom: 12,
          }}>
            {nameEn}
          </div>
        )}
        {/* 로고 + 한글명 */}
        {(logoDataUrl || nameKo) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: '#FFFFFF', borderRadius: 16, padding: '14px 28px',
            border: '2px solid #E5E5E5',
          }}>
            {logoDataUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img src={logoDataUrl} width={56} height={56} alt="" />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#1B1B1B' }}>
                {nameKo}
              </span>
              {nameEn && (
                <span style={{ fontSize: 16, color: '#666666', fontFamily: 'Inter' }}>
                  {nameEn}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
