import type { BrandAssets, MedicalLawPreset } from '@/types/brand';

interface Props {
  assets: BrandAssets;
  preset: MedicalLawPreset;
  logoDataUrl: string | null;
}

// satori는 React DOM을 렌더링하지 않고 JSX 트리를 SVG로 직접 변환한다.
// 인라인 스타일과 flex 레이아웃만 사용 가능하다.
export function MedicalLawNotice({ assets, preset, logoDataUrl }: Props) {
  const clinicName = assets.name_ko || '';
  const topText = assets.medical_law_top_text.replace('{clinic_name}', clinicName);
  const bottomText = assets.medical_law_bottom_text;

  return (
    <div style={{
      width: 1200, height: 630, display: 'flex', flexDirection: 'column',
      background: preset.background, fontFamily: 'Pretendard',
    }}>
      {/* 상단 박스 */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 80px',
      }}>
        <div style={{
          background: '#FFFFFF', borderRadius: 16, padding: '32px 48px',
          border: `4px solid ${preset.accent}`,
          fontSize: 32, color: preset.textOnBackground,
          textAlign: 'center', lineHeight: 1.5,
        }}>
          {topText}
        </div>
      </div>
      {/* 하단 박스 */}
      <div style={{
        background: preset.accent, color: preset.textOnAccent,
        padding: '36px 80px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 28, textAlign: 'center', lineHeight: 1.5 }}>
          {bottomText}
        </div>
        {logoDataUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={logoDataUrl} width={48} height={48} alt="" />
            <span style={{ fontSize: 26, fontWeight: 700 }}>{clinicName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
