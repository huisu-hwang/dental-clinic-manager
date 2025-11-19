const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = 'https://beahjntkmkfhpcbhfnrr.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYWhqbnRrbWtmaHBjYmhmbnJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk0MTI3NSwiZXhwIjoyMDczNTE3Mjc1fQ.bmb2sD5wsdJo_EmSDdB4jD0_PefveyXDjGjfo1uXBxs'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
  try {
    console.log('Reading migration file...')
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251114_add_clinic_branches_rls.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    console.log('Applying RLS policies for clinic_branches...')
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

    if (error) {
      console.error('Error applying migration:', error)
      process.exit(1)
    }

    console.log('✅ RLS policies applied successfully!')
    console.log('Result:', data)
  } catch (error) {
    console.error('Unexpected error:', error)
    process.exit(1)
  }
}

applyMigration()
