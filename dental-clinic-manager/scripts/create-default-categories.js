/**
 * 기본 프로토콜 카테고리 생성 스크립트
 *
 * 사용법: node scripts/create-default-categories.js
 */

const { createClient } = require('@supabase/supabase-js');

// .env.local 파일 로드
require('dotenv').config({ path: '.env.local' });

const defaultCategories = [
  { name: '임플란트', description: '임플란트 시술 관련 프로토콜', color: '#3B82F6', display_order: 1 },
  { name: '보철', description: '보철 치료 관련 프로토콜', color: '#10B981', display_order: 2 },
  { name: '치주', description: '치주 치료 관련 프로토콜', color: '#F59E0B', display_order: 3 },
  { name: '보존', description: '보존 치료 관련 프로토콜', color: '#EF4444', display_order: 4 },
  { name: '교정', description: '교정 치료 관련 프로토콜', color: '#8B5CF6', display_order: 5 },
  { name: '구강외과', description: '구강외과 시술 관련 프로토콜', color: '#EC4899', display_order: 6 },
  { name: '소아치과', description: '소아 치과 관련 프로토콜', color: '#06B6D4', display_order: 7 },
  { name: '예방', description: '예방 치료 관련 프로토콜', color: '#F97316', display_order: 8 },
];

async function createDefaultCategories() {
  // Supabase 설정
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase 설정이 .env.local에 없습니다.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log('🔍 클리닉 정보 확인 중...\n');

  // 1. 모든 클리닉 조회
  const { data: clinics, error: clinicsError } = await supabase
    .from('clinics')
    .select('id, name');

  if (clinicsError) {
    console.error('❌ 클리닉 조회 실패:', clinicsError);
    process.exit(1);
  }

  if (!clinics || clinics.length === 0) {
    console.log('⚠️  등록된 클리닉이 없습니다.');
    process.exit(0);
  }

  console.log(`✅ ${clinics.length}개의 클리닉을 찾았습니다:\n`);
  clinics.forEach((clinic, idx) => {
    console.log(`   ${idx + 1}. ${clinic.name} (${clinic.id})`);
  });
  console.log('');

  // 2. 각 클리닉에 대해 기본 카테고리 생성
  for (const clinic of clinics) {
    console.log(`📁 "${clinic.name}" 클리닉의 카테고리 생성 중...`);

    // 기존 카테고리 확인
    const { data: existingCategories, error: checkError } = await supabase
      .from('protocol_categories')
      .select('name')
      .eq('clinic_id', clinic.id);

    if (checkError) {
      console.error(`   ❌ 기존 카테고리 확인 실패:`, checkError.message);
      continue;
    }

    const existingNames = new Set(existingCategories?.map(c => c.name) || []);
    console.log(`   현재 ${existingCategories?.length || 0}개의 카테고리가 있습니다.`);

    // 없는 카테고리만 생성
    const categoriesToCreate = defaultCategories
      .filter(cat => !existingNames.has(cat.name))
      .map(cat => ({
        clinic_id: clinic.id,
        ...cat
      }));

    if (categoriesToCreate.length === 0) {
      console.log(`   ✅ 모든 기본 카테고리가 이미 존재합니다.\n`);
      continue;
    }

    console.log(`   📝 ${categoriesToCreate.length}개의 카테고리를 생성합니다...`);

    const { data: created, error: createError } = await supabase
      .from('protocol_categories')
      .insert(categoriesToCreate)
      .select();

    if (createError) {
      console.error(`   ❌ 카테고리 생성 실패:`, createError.message);
      console.error(`   세부 정보:`, createError);
      continue;
    }

    console.log(`   ✅ ${created?.length || 0}개의 카테고리가 생성되었습니다:`);
    created?.forEach(cat => {
      console.log(`      - ${cat.name}`);
    });
    console.log('');
  }

  console.log('✨ 기본 카테고리 생성이 완료되었습니다!\n');

  // 3. 최종 확인
  console.log('📊 최종 카테고리 현황:\n');
  for (const clinic of clinics) {
    const { data: categories, error } = await supabase
      .from('protocol_categories')
      .select('name, color')
      .eq('clinic_id', clinic.id)
      .order('display_order');

    if (!error && categories) {
      console.log(`   ${clinic.name}:`);
      categories.forEach(cat => {
        console.log(`      • ${cat.name} (${cat.color})`);
      });
      console.log('');
    }
  }
}

createDefaultCategories().catch(err => {
  console.error('❌ 오류 발생:', err);
  process.exit(1);
});
