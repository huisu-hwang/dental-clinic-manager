require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

// 기본 카테고리 정의
const defaultCategories = [
  { name: '검진 및 진단', description: '정기 검진, 진단 관련 프로토콜', color: '#3B82F6', display_order: 1 },
  { name: '치료 절차', description: '치료 관련 프로토콜', color: '#10B981', display_order: 2 },
  { name: '예방 관리', description: '예방 치료 관련 프로토콜', color: '#F59E0B', display_order: 3 },
  { name: '응급 처치', description: '응급 상황 대응 프로토콜', color: '#EF4444', display_order: 4 },
  { name: '환자 상담', description: '환자 상담 및 설명 프로토콜', color: '#8B5CF6', display_order: 5 }
]

// 샘플 프로토콜 정의
const sampleProtocols = [
  {
    categoryName: '검진 및 진단',
    title: '정기 구강 검진 프로토콜',
    content: '<h3>1. 환자 맞이 및 확인</h3><p>환자의 이름과 예약 시간을 확인하고, 병력을 업데이트합니다.</p><h3>2. 구강 검사</h3><p>치아, 잇몸, 혀, 구강 점막 등을 자세히 검사합니다.</p><h3>3. 엑스레이 촬영</h3><p>필요시 파노라마 또는 개별 치아 엑스레이를 촬영합니다.</p><h3>4. 치석 제거</h3><p>스케일링을 통해 치석과 플라그를 제거합니다.</p><h3>5. 결과 설명</h3><p>검진 결과를 환자에게 설명하고 향후 치료 계획을 상담합니다.</p>',
    tags: ['정기검진', '구강검사', '스케일링'],
    status: 'active'
  },
  {
    categoryName: '치료 절차',
    title: '충치 치료 (레진) 프로토콜',
    content: '<h3>1. 마취</h3><p>국소 마취를 실시하여 통증을 최소화합니다.</p><h3>2. 충치 제거</h3><p>고속 핸드피스로 충치 부분을 제거합니다.</p><h3>3. 치아 형성</h3><p>레진 충전을 위한 cavity를 형성합니다.</p><h3>4. 본딩 처리</h3><p>본딩제를 도포하고 광중합합니다.</p><h3>5. 레진 충전</h3><p>레진을 층층이 충전하고 각 층을 광중합합니다.</p><h3>6. 형태 조정</h3><p>교합을 확인하고 형태를 조정합니다.</p><h3>7. 연마</h3><p>표면을 매끄럽게 연마합니다.</p>',
    tags: ['충치치료', '레진', '보존치료'],
    status: 'active'
  },
  {
    categoryName: '예방 관리',
    title: '불소 도포 프로토콜',
    content: '<h3>1. 치면 세마</h3><p>치아 표면의 플라그와 착색을 제거합니다.</p><h3>2. 치아 건조</h3><p>불소 도포 전 치아를 완전히 건조시킵니다.</p><h3>3. 불소 도포</h3><p>불소 젤 또는 바니시를 치아 표면에 도포합니다.</p><h3>4. 대기 시간</h3><p>불소가 치아에 흡수되도록 3-5분간 대기합니다.</p><h3>5. 주의사항 설명</h3><p>시술 후 30분간 음식 섭취를 피하도록 안내합니다.</p>',
    tags: ['예방', '불소도포', '소아치과'],
    status: 'active'
  },
  {
    categoryName: '환자 상담',
    title: '치료 계획 상담 프로토콜',
    content: '<h3>1. 현재 상태 설명</h3><p>환자의 현재 구강 상태를 이해하기 쉽게 설명합니다.</p><h3>2. 치료 옵션 제시</h3><p>가능한 치료 방법들과 각각의 장단점을 설명합니다.</p><h3>3. 비용 안내</h3><p>각 치료 옵션별 예상 비용을 투명하게 안내합니다.</p><h3>4. 일정 조율</h3><p>환자의 스케줄을 고려하여 치료 일정을 계획합니다.</p><h3>5. 동의서 작성</h3><p>치료 동의서를 작성하고 환자의 서명을 받습니다.</p>',
    tags: ['상담', '치료계획', '설명'],
    status: 'active'
  }
]

async function createDefaultProtocols() {
  try {
    // 모든 클리닉 조회
    const { data: clinics } = await supabase
      .from('clinics')
      .select('id')

    if (!clinics || clinics.length === 0) {
      console.log('No clinics found')
      return
    }

    console.log(`Found ${clinics.length} clinics`)

    for (const clinic of clinics) {
      const clinicId = clinic.id
      console.log(`\n=== Processing clinic: ${clinicId} ===`)

      // RPC를 사용하여 기본 카테고리 생성 (RLS 우회)
      console.log('Creating default categories using RPC...')
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'create_default_protocol_categories',
        { p_clinic_id: clinicId }
      )

      if (rpcError) {
        console.error('Error creating categories via RPC:', rpcError)
        console.log('Falling back to direct insert (may fail due to RLS)...')
      } else {
        console.log('✓ Default categories created successfully via RPC')
      }

      // 생성된 카테고리 확인
      const { data: createdCategories, error: fetchError } = await supabase
        .from('protocol_categories')
        .select('*')
        .eq('clinic_id', clinicId)

      if (fetchError) {
        console.error('Error fetching categories:', fetchError)
        continue
      }

      console.log(`Found ${createdCategories?.length || 0} categories for this clinic`)

      // 사용자 정보 가져오기
      const { data: users } = await supabase
        .from('users')
        .select('id, email')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .limit(1)

      if (!users || users.length === 0) {
        console.log('No active users found for this clinic, skipping protocols')
        continue
      }

      const createdBy = users[0].id

      // 프로토콜 생성
      console.log('\nCreating sample protocols...')

      if (!createdCategories || createdCategories.length === 0) {
        console.log('No categories available, skipping protocol creation')
        continue
      }

      for (const protocol of sampleProtocols) {
        const category = createdCategories.find(c => c.name === protocol.categoryName)
        if (!category) {
          console.log(`Category "${protocol.categoryName}" not found for protocol: ${protocol.title}`)
          continue
        }

        // 프로토콜 생성
        const { data: newProtocol, error: protocolError } = await supabase
          .from('protocols')
          .insert({
            clinic_id: clinicId,
            category_id: category.id,
            title: protocol.title,
            content: protocol.content,
            status: protocol.status,
            tags: protocol.tags,
            created_by: createdBy
          })
          .select()
          .single()

        if (protocolError) {
          console.error(`Error creating protocol ${protocol.title}:`, protocolError)
          continue
        }

        // 프로토콜 버전 생성
        const { data: version, error: versionError } = await supabase
          .from('protocol_versions')
          .insert({
            protocol_id: newProtocol.id,
            version_number: 1,
            content: protocol.content,
            change_summary: '초기 버전 생성',
            change_type: 'major',
            created_by: createdBy
          })
          .select()
          .single()

        if (versionError) {
          console.error(`Error creating version for ${protocol.title}:`, versionError)
          continue
        }

        // 프로토콜의 current_version_id 업데이트
        const { error: updateError } = await supabase
          .from('protocols')
          .update({ current_version_id: version.id })
          .eq('id', newProtocol.id)

        if (updateError) {
          console.error(`Error updating current_version_id for ${protocol.title}:`, updateError)
        } else {
          console.log(`✓ Created protocol: ${protocol.title}`)
        }
      }

      console.log(`\nCompleted for clinic: ${clinicId}`)
    }

    console.log('\n=== All done! ===')
  } catch (error) {
    console.error('Error:', error)
  }
}

createDefaultProtocols().catch(console.error)
