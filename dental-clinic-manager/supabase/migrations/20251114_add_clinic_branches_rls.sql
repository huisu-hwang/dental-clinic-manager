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
