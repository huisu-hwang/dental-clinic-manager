const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function deleteAccounts() {
  console.log('계정 삭제 프로세스 시작...\n');

  const accountsToDelete = [
    'admin@dentalmanager.com',
    'sani81@gmail.com'
  ];

  for (const email of accountsToDelete) {
    console.log(`\n${email} 처리 중...`);
    console.log('='.repeat(50));

    try {
      // 1. users 테이블에서 삭제
      console.log(`1. users 테이블에서 ${email} 삭제 중...`);
      const { data: userData, error: userSelectError } = await supabase
        .from('users')
        .select('id, clinic_id')
        .eq('email', email);

      if (userData && userData.length > 0) {
        const clinicIds = userData.map(u => u.clinic_id).filter(Boolean);

        const { error: userDeleteError } = await supabase
          .from('users')
          .delete()
          .eq('email', email);

        if (userDeleteError) {
          console.log(`   ❌ users 테이블 삭제 실패: ${userDeleteError.message}`);
        } else {
          console.log(`   ✅ users 테이블에서 삭제 완료 (${userData.length}개 레코드)`);
        }

        // 2. 연관된 clinics 삭제 (owner인 경우)
        if (clinicIds.length > 0) {
          console.log(`2. 연관된 병원 정보 삭제 중...`);
          for (const clinicId of clinicIds) {
            // 먼저 이 병원에 연결된 모든 데이터 삭제

            // appointments 삭제
            const { error: apptError } = await supabase
              .from('appointments')
              .delete()
              .eq('clinic_id', clinicId);

            if (!apptError) {
              console.log(`   ✅ 예약 데이터 삭제 완료`);
            }

            // inventory 삭제
            const { error: invError } = await supabase
              .from('inventory')
              .delete()
              .eq('clinic_id', clinicId);

            if (!invError) {
              console.log(`   ✅ 재고 데이터 삭제 완료`);
            }

            // inventory_categories 삭제
            const { error: catError } = await supabase
              .from('inventory_categories')
              .delete()
              .eq('clinic_id', clinicId);

            if (!catError) {
              console.log(`   ✅ 재고 카테고리 삭제 완료`);
            }

            // patients 삭제
            const { error: patError } = await supabase
              .from('patients')
              .delete()
              .eq('clinic_id', clinicId);

            if (!patError) {
              console.log(`   ✅ 환자 데이터 삭제 완료`);
            }

            // 마지막으로 clinic 삭제
            const { error: clinicDeleteError } = await supabase
              .from('clinics')
              .delete()
              .eq('id', clinicId);

            if (clinicDeleteError) {
              console.log(`   ❌ 병원 삭제 실패: ${clinicDeleteError.message}`);
            } else {
              console.log(`   ✅ 병원 정보 삭제 완료`);
            }
          }
        }
      } else {
        console.log(`   ℹ️ users 테이블에 ${email} 없음`);
      }

      // 3. clinics 테이블에서 email로도 확인
      console.log(`3. clinics 테이블에서 ${email} 확인 중...`);
      const { data: clinicData, error: clinicSelectError } = await supabase
        .from('clinics')
        .select('id')
        .eq('email', email);

      if (clinicData && clinicData.length > 0) {
        for (const clinic of clinicData) {
          // 관련 데이터 삭제
          await supabase.from('appointments').delete().eq('clinic_id', clinic.id);
          await supabase.from('inventory').delete().eq('clinic_id', clinic.id);
          await supabase.from('inventory_categories').delete().eq('clinic_id', clinic.id);
          await supabase.from('patients').delete().eq('clinic_id', clinic.id);
          await supabase.from('users').delete().eq('clinic_id', clinic.id);

          const { error: clinicDeleteError } = await supabase
            .from('clinics')
            .delete()
            .eq('id', clinic.id);

          if (!clinicDeleteError) {
            console.log(`   ✅ 추가 병원 정보 삭제 완료`);
          }
        }
      } else {
        console.log(`   ℹ️ clinics 테이블에 ${email} 없음`);
      }

      // 4. Auth 사용자 삭제 시도 (권한 문제로 실패할 수 있음)
      console.log(`4. Auth에서 ${email} 삭제 시도...`);
      console.log(`   ⚠️ Auth 사용자는 Supabase 대시보드에서 직접 삭제해야 합니다.`);
      console.log(`   경로: Authentication > Users > ${email} > Delete user`);

    } catch (error) {
      console.error(`${email} 처리 중 오류:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('삭제 프로세스 완료!');
  console.log('='.repeat(70));
  console.log('\n데이터베이스에서 관련 데이터가 삭제되었습니다.');
  console.log('\nAuth 사용자를 완전히 삭제하려면:');
  console.log('1. Supabase 대시보드 접속');
  console.log('2. Authentication > Users 메뉴로 이동');
  console.log('3. admin@dentalmanager.com 찾아서 Delete');
  console.log('4. sani81@gmail.com 찾아서 Delete');
  console.log('\n또는 Service Role Key가 있다면 Admin API를 사용할 수 있습니다.');
}

deleteAccounts();