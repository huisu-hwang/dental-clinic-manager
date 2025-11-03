require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set in .env.local')
  console.error('Please add: SUPABASE_SERVICE_ROLE_KEY=your_service_role_key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('=== Running Protocol Steps Migration ===\n')

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250128_add_version_id_to_protocol_steps.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('Migration SQL loaded successfully\n')
    console.log('Executing migration...\n')

    // Execute the migration
    // Note: Supabase JS client doesn't support raw SQL execution
    // We need to execute this via the SQL Editor in Supabase dashboard
    // or use the Supabase CLI

    console.log('⚠️  NOTE: This migration needs to be run via Supabase SQL Editor')
    console.log('\nPlease follow these steps:')
    console.log('1. Go to https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql/new')
    console.log('2. Copy the SQL from: supabase/migrations/20250128_add_version_id_to_protocol_steps.sql')
    console.log('3. Paste it into the SQL Editor')
    console.log('4. Click "Run" to execute\n')

    console.log('Or use Supabase CLI:')
    console.log('  npx supabase db push\n')

    console.log('Migration content:')
    console.log('='.repeat(60))
    console.log(migrationSQL)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

runMigration()
