require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkMigrations() {
  console.log('=== Checking if migrations were applied ===\n')

  // 1. 테이블 존재 확인
  console.log('1. Checking if tables exist...')

  const tables = ['protocol_categories', 'protocols', 'protocol_versions']

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('count')
      .limit(1)

    if (error) {
      console.log(`  ❌ Table "${table}" error:`, error.message)
    } else {
      console.log(`  ✓ Table "${table}" exists`)
    }
  }

  // 2. 함수 존재 확인
  console.log('\n2. Checking if create_default_protocol_categories function exists...')

  const { data: funcData, error: funcError } = await supabase.rpc(
    'create_default_protocol_categories',
    { p_clinic_id: '00000000-0000-0000-0000-000000000000' }
  )

  if (funcError) {
    if (funcError.message.includes('function') && funcError.message.includes('does not exist')) {
      console.log('  ❌ Function does NOT exist - Migration NOT applied')
    } else {
      console.log('  ⚠️  Function exists but error occurred:', funcError.message)
    }
  } else {
    console.log('  ✓ Function exists')
  }

  // 3. 트리거 확인 (간접적)
  console.log('\n3. Checking data...')
  const { data: categories } = await supabase
    .from('protocol_categories')
    .select('*')

  console.log(`  Total categories: ${categories?.length || 0}`)

  const { data: clinics } = await supabase
    .from('clinics')
    .select('id, name')

  console.log(`  Total clinics: ${clinics?.length || 0}`)

  if (clinics && clinics.length > 0 && (!categories || categories.length === 0)) {
    console.log('\n  ⚠️  WARNING: Clinics exist but NO categories!')
    console.log('  This means either:')
    console.log('  - Migration was not applied')
    console.log('  - Trigger is not working')
    console.log('  - Data was deleted')
  }

  // 4. 최근 생성된 클리닉 확인
  console.log('\n4. Recent clinics:')
  if (clinics && clinics.length > 0) {
    clinics.forEach(c => {
      console.log(`  - ${c.name} (${c.id})`)
    })
  }
}

checkMigrations().catch(console.error)
