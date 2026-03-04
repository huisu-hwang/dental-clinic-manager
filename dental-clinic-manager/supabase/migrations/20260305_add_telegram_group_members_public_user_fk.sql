-- Add FK to public.users so PostgREST can join telegram_group_members with public.users
ALTER TABLE telegram_group_members
  ADD CONSTRAINT telegram_group_members_user_id_public_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
