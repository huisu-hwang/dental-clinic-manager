import { createClient } from '@/lib/supabase/server';
import { DEFAULT_PROMPTS } from './default-prompts';

/**
 * 클리닉에 기본 프롬프트가 없으면 자동으로 시드 데이터를 삽입합니다.
 * 이미 프롬프트가 존재하면 아무 작업도 하지 않습니다.
 */
export async function seedDefaultPromptsIfNeeded(clinicId: string, userId?: string): Promise<boolean> {
  const supabase = await createClient();

  // 이미 프롬프트가 있는지 확인
  const { count, error: countError } = await supabase
    .from('marketing_prompts')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId);

  if (countError) {
    console.error('[seed-prompts] 프롬프트 카운트 조회 실패:', countError);
    return false;
  }

  if (count && count > 0) {
    return false; // 이미 존재하면 시딩 불필요
  }

  console.log(`[seed-prompts] 클리닉 ${clinicId}에 기본 프롬프트 ${DEFAULT_PROMPTS.length}개 삽입 시작`);

  const rows = DEFAULT_PROMPTS.map((p) => ({
    clinic_id: clinicId,
    category: p.category,
    prompt_key: p.prompt_key,
    name: p.name,
    system_prompt: p.system_prompt,
    variables: p.variables,
    version: 1,
    is_active: true,
    created_by: userId || null,
    updated_by: userId || null,
  }));

  const { error: insertError } = await supabase
    .from('marketing_prompts')
    .insert(rows);

  if (insertError) {
    console.error('[seed-prompts] 기본 프롬프트 삽입 실패:', insertError);
    return false;
  }

  console.log(`[seed-prompts] 기본 프롬프트 ${DEFAULT_PROMPTS.length}개 삽입 완료`);
  return true;
}
