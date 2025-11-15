const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://beahjntkmkfhpcbhfnrr.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYWhqbnRrbWtmaHBjYmhmbnJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk0MTI3NSwiZXhwIjoyMDczNTE3Mjc1fQ.bmb2sD5wsdJo_EmSDdB4jD0_PefveyXDjGjfo1uXBxs'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkAndApplyRLS() {
  try {
    console.log('='.repeat(60))
    console.log('1. Checking current RLS status...')
    console.log('='.repeat(60))

    // Check if RLS is enabled
    const { data: rlsStatus, error: rlsError } = await supabase
      .from('clinic_branches')
      .select('*')
      .limit(1)

    if (rlsError) {
      console.error('❌ Error checking RLS status:', rlsError.message)
    } else {
      console.log('✅ Can query clinic_branches (using Service Role Key)')
      console.log(`   Found ${rlsStatus?.length || 0} row(s)`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('2. SQL to apply RLS policies:')
    console.log('='.repeat(60))
    console.log(`
Please run the following SQL in Supabase SQL Editor:
https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql/new

-- Enable RLS on clinic_branches table
ALTER TABLE public.clinic_branches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view branches from their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners can manage branches in their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Managers can manage branches in their clinic" ON public.clinic_branches;

-- Policy: All authenticated users can view branches from their clinic
CREATE POLICY "Users can view branches from their clinic"
ON public.clinic_branches
FOR SELECT
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- Policy: Owners can insert/update/delete branches in their clinic
CREATE POLICY "Owners can manage branches in their clinic"
ON public.clinic_branches
FOR ALL
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'owner'
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'owner'
  )
);

-- Policy: Managers can insert/update/delete branches in their clinic
CREATE POLICY "Managers can manage branches in their clinic"
ON public.clinic_branches
FOR ALL
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'manager'
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'manager'
  )
);
`)

    console.log('\n' + '='.repeat(60))
    console.log('3. After applying the SQL, verify with:')
    console.log('='.repeat(60))
    console.log(`
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'clinic_branches';
`)

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

checkAndApplyRLS()
