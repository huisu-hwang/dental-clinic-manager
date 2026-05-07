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

  // 30자 + 개행 1회 제한 (스펙 5.5)
  const truncated = copy.length > 31 ? copy.slice(0, 30) + '…' : copy;

  return (
    <div style={{
      width: 1080, height: 1080, display: 'flex', padding: 40,
      background: '#FFFFFF', fontFamily: 'Pretendard',
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: primary, borderRadius: 24, padding: 60,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* 슬로건 */}
        {slogan && (
          <div style={{
            background: 'rgba(0,0,0,0.6)', color: '#FFFFFF',
            padding: '12px 28px', borderRadius: 999,
            fontSize: 28, fontWeight: 700,
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
          {truncated}
        </div>
        {/* 영문명 */}
        {nameEn && (
          <div style={{
            fontSize: 26, letterSpacing: 4, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'Inter',
          }}>
            {nameEn}
          </div>
        )}
        {/* 로고 + 한글명 */}
        {(logoDataUrl || nameKo) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: '#FFFFFF', borderRadius: 16, padding: '14px 28px',
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
