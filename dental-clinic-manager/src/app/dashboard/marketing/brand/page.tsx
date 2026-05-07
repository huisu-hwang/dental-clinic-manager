import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';
import { BrandSettingsClient } from './BrandSettingsClient';

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_view')) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-at-text-secondary">이 페이지를 볼 권한이 없습니다.</p>
      </div>
    );
  }

  return <BrandSettingsClient canManage={hasPermission(ctx, 'marketing_brand_manage')} />;
}
