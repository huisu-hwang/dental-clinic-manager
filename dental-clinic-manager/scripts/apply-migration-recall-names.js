const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🔧 Applying migration: add recall_booking_names column...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251111_add_recall_booking_names.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n🚀 Executing migration...\n');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // If exec_sql doesn't exist, try direct query
      console.log('⚠️ exec_sql RPC not found, trying direct query...\n');

      // Split by semicolons and execute each statement
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement) {
          console.log('Executing:', statement.substring(0, 100) + '...');
          const { error: queryError } = await supabase.from('_migrations').select().limit(0); // This won't work

          // We need to use the postgres client directly
          console.log('\n❌ Cannot execute raw SQL through Supabase client.');
          console.log('📝 Please execute this SQL manually in Supabase SQL Editor:\n');
          console.log('1. Go to: https://supabase.com/dashboard/project/[your-project]/sql/new');
          console.log('2. Copy and paste the following SQL:\n');
          console.log('---');
          console.log(migrationSQL);
          console.log('---');
          console.log('\n3. Click "Run" to execute the migration.');
          return;
        }
      }
    }

    console.log('✅ Migration applied successfully!');

    // Verify the column was added
    console.log('\n🔍 Verifying column exists...');
    const { data: tableInfo, error: verifyError } = await supabase
      .from('daily_reports')
      .select('*')
      .limit(1);

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
    } else {
      if (tableInfo && tableInfo.length > 0) {
        const columns = Object.keys(tableInfo[0]);
        console.log('📊 Current columns:', columns.join(', '));

        if (columns.includes('recall_booking_names')) {
          console.log('✅ Column recall_booking_names exists!');
        } else {
          console.log('⚠️ Column recall_booking_names NOT found in result');
        }
      }
    }

  } catch (err) {
    console.error('❌ Error applying migration:', err);
    process.exit(1);
  }
}

applyMigration();
