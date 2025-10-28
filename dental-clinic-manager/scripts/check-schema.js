require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  console.log('=== Checking protocol_categories schema ===')

  // 빈 insert를 시도하여 필수 컬럼 확인
  const { data, error } = await supabase
    .from('protocol_categories')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Sample row (if exists):', data)
  }

  // 테스트 insert
  console.log('\n=== Testing insert ===')
  const { data: testData, error: testError } = await supabase
    .from('protocol_categories')
    .insert({
      clinic_id: 'test',
      name: 'test',
      display_order: 1
    })
    .select()

  if (testError) {
    console.error('Test insert error:', testError)
  } else {
    console.log('Test insert success:', testData)

    // 삭제
    await supabase
      .from('protocol_categories')
      .delete()
      .eq('name', 'test')
  }
}

checkSchema().catch(console.error)
