require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Supabase URL:', supabaseUrl)
console.log('Supabase Key exists:', !!supabaseKey)

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkProtocols() {
  console.log('\n=== Checking Protocols ===')

  // 1. 모든 프로토콜 조회 (삭제된 것 포함)
  const { data: allProtocols, error: allProtocolsError } = await supabase
    .from('protocols')
    .select('*')

  if (allProtocolsError) {
    console.error('Error fetching all protocols:', allProtocolsError)
  } else {
    console.log(`Total protocols (including deleted): ${allProtocols?.length || 0}`)
    const deleted = allProtocols?.filter(p => p.deleted_at !== null) || []
    console.log(`Deleted protocols: ${deleted.length}`)
  }

  // 2. 삭제되지 않은 프로토콜만 조회
  const { data: protocols, error: protocolsError } = await supabase
    .from('protocols')
    .select('*')
    .is('deleted_at', null)

  if (protocolsError) {
    console.error('Error fetching protocols:', protocolsError)
  } else {
    console.log(`Active protocols: ${protocols?.length || 0}`)
    if (protocols && protocols.length > 0) {
      console.log('Sample protocol:', JSON.stringify(protocols[0], null, 2))
    }
  }

  // 2. 모든 프로토콜 카테고리 조회
  console.log('\n=== Checking Protocol Categories ===')
  const { data: categories, error: categoriesError } = await supabase
    .from('protocol_categories')
    .select('*')

  if (categoriesError) {
    console.error('Error fetching categories:', categoriesError)
  } else {
    console.log(`Total categories: ${categories?.length || 0}`)
    if (categories && categories.length > 0) {
      console.log('Categories:', JSON.stringify(categories, null, 2))
    }
  }

  // 3. clinic_id별로 그룹화
  console.log('\n=== Protocols by Clinic ===')
  if (protocols && protocols.length > 0) {
    const byClinic = {}
    protocols.forEach(p => {
      if (!byClinic[p.clinic_id]) {
        byClinic[p.clinic_id] = []
      }
      byClinic[p.clinic_id].push(p)
    })

    for (const [clinicId, items] of Object.entries(byClinic)) {
      console.log(`Clinic ${clinicId}: ${items.length} protocols`)
    }
  }

  // 4. 사용자 정보 확인
  console.log('\n=== Checking Users ===')
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, name, clinic_id, role, status')

  if (usersError) {
    console.error('Error fetching users:', usersError)
  } else {
    console.log(`Total users: ${users?.length || 0}`)
    if (users && users.length > 0) {
      users.forEach(u => {
        console.log(`- ${u.email} (${u.role}) - Clinic: ${u.clinic_id} - Status: ${u.status}`)
      })
    }
  }
}

checkProtocols().catch(console.error)
