import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GitHub 최신 워커 릴리즈 버전 캐시 (5분 TTL)
let cachedLatestVersion: string | null = null;
let cachedReleaseDate: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

// semver 순서 비교: a > b 이면 양수, 같으면 0, a < b 이면 음수.
// pre-release/build 메타데이터는 무시하고 숫자 부분만 비교한다.
function compareSemver(a: string, b: string): number {
  const norm = (v: string) => v.replace(/^v/, '').split(/[-+]/)[0];
  const pa = norm(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = norm(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function getLatestWorkerInfo(): Promise<{ version: string | null; releaseDate: string | null }> {
  if (cachedLatestVersion && Date.now() - cacheTimestamp < CACHE_TTL) {
    return { version: cachedLatestVersion, releaseDate: cachedReleaseDate };
  }
  try {
    const res = await fetch('https://api.github.com/repos/huisu-hwang/dental-clinic-manager/releases', {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return { version: cachedLatestVersion, releaseDate: cachedReleaseDate };
    const releases = await res.json();

    // Electron 워커 릴리즈 식별:
    // - electron-builder 가 생성하는 에셋 파일명 패턴 `clinic-manager-worker-<ver>-setup.exe` 를 찾는다.
    // - 과거 `worker-v*` 태그 형식과 신 `v*` 태그 형식을 모두 지원한다.
    // - 태그에 버전 정보가 있는 경우 우선 사용하고, 없으면 에셋 파일명에서 추출한다.
    type GhAsset = { name?: string };
    type GhRelease = { tag_name?: string; published_at?: string; draft?: boolean; assets?: GhAsset[] };

    const workerRelease = (releases as GhRelease[]).find((r) => {
      if (r.draft) return false;
      return !!r.assets?.some(
        (a) => typeof a.name === 'string' && /^clinic-manager-worker-.+-setup\.exe$/.test(a.name)
      );
    });

    if (workerRelease) {
      // 버전 추출: tag_name 에서 우선 시도 (worker-v1.2.3 / v1.2.3 → 1.2.3)
      let version: string | null = null;
      if (workerRelease.tag_name) {
        const tagMatch = workerRelease.tag_name.match(/^(?:worker-)?v?(.+)$/);
        if (tagMatch) version = tagMatch[1];
      }
      // tag_name 에서 못 얻으면 에셋 파일명에서 파싱
      if (!version && workerRelease.assets) {
        for (const a of workerRelease.assets) {
          if (!a.name) continue;
          const m = a.name.match(/^clinic-manager-worker-(.+?)-setup\.exe$/);
          if (m) {
            version = m[1];
            break;
          }
        }
      }

      if (version) {
        cachedLatestVersion = version;
        cachedReleaseDate = workerRelease.published_at || null;
        cacheTimestamp = Date.now();
      }
    }
  } catch {
    // GitHub API 실패 시 캐시된 값 반환
  }
  return { version: cachedLatestVersion, releaseDate: cachedReleaseDate };
}

// GET: 워커 상태 조회 (마케팅, 스크래핑, SEO, 이메일)
// ?type=marketing | scraping | seo | email | all (기본값: all)
export async function GET(request: NextRequest) {
  try {
    // 인증 확인 (일반 사용자도 조회 가능)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const result: {
      marketing?: {
        installed: boolean;
        online: boolean;
        currentVersion: string | null;
        latestVersion: string | null;
        updateAvailable: boolean;
        updateStatus: string | null;
        latestReleaseDate: string | null;
      };
      scraping?: { installed: boolean; online: boolean; workerCount: number };
      seo?: { installed: boolean; online: boolean; workerCount: number };
      email?: { installed: boolean; online: boolean };
      dentweb?: { installed: boolean; online: boolean; lastSyncStatus: string | null };
    } = {};

    // 마케팅 워커 상태 (DB 기반 - Electron 워커가 heartbeat 업데이트)
    if (type === 'marketing' || type === 'all') {
      let installed = false;
      let online = false;
      let currentVersion: string | null = null;
      let updateStatus: string | null = null;
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: controlData } = await admin
          .from('marketing_worker_control')
          .select('watchdog_online, worker_running, last_updated, worker_version, update_status')
          .eq('id', 'main')
          .single();

        if (controlData) {
          // 주의: marketing_worker_control 테이블은 마이그레이션 시점에 id='main' seed row가
          // 자동 삽입되므로 "row 존재 여부"만으로는 설치 여부를 판정할 수 없다.
          // 실제 워커가 한 번이라도 실행되면 worker_version이 기록되거나
          // watchdog_online=true 로 heartbeat가 올라오므로 이를 설치의 증거로 사용한다.
          const hasVersion = !!controlData.worker_version;
          const hasHeartbeat = !!controlData.watchdog_online;
          installed = hasVersion || hasHeartbeat;

          const lastUpdated = controlData.last_updated ? new Date(controlData.last_updated) : null;
          const isRecent = lastUpdated && (Date.now() - lastUpdated.getTime() < 60_000);
          online = !!(controlData.watchdog_online && isRecent);
          currentVersion = controlData.worker_version || null;
          updateStatus = controlData.update_status || null;
        }
      }

      const { version: latestVersion, releaseDate: latestReleaseDate } = await getLatestWorkerInfo();
      const updateAvailable = !!(currentVersion && latestVersion && compareSemver(latestVersion, currentVersion) > 0);

      result.marketing = { installed, online, currentVersion, latestVersion, updateAvailable, updateStatus, latestReleaseDate };
    }

    // 스크래핑 워커 상태
    if (type === 'scraping' || type === 'all') {
      let installed = false;
      let online = false;
      let workerCount = 0;
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: workers } = await admin
          .from('scraping_workers')
          .select('status, last_heartbeat')
          .order('last_heartbeat', { ascending: false });

        if (workers && workers.length > 0) {
          // 워커 레코드가 존재하면 과거에 한 번이라도 설치/등록된 것으로 간주
          installed = true;
          const onlineWorkers = workers.filter((w) => {
            if (w.status === 'offline') return false;
            const lastBeat = new Date(w.last_heartbeat);
            return Date.now() - lastBeat.getTime() < 2 * 60 * 1000;
          });
          workerCount = onlineWorkers.length;
          online = workerCount > 0;
        }
      }
      result.scraping = { installed, online, workerCount };
    }

    // SEO 워커 상태 (seo_workers 테이블 heartbeat 기반)
    if (type === 'seo' || type === 'all') {
      let installed = false;
      let online = false;
      let workerCount = 0;
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: workers } = await admin
          .from('seo_workers')
          .select('status, last_heartbeat')
          .order('last_heartbeat', { ascending: false });

        if (workers && workers.length > 0) {
          installed = true;
          const onlineWorkers = workers.filter((w) => {
            if (w.status === 'offline') return false;
            const lastBeat = new Date(w.last_heartbeat);
            return Date.now() - lastBeat.getTime() < 2 * 60 * 1000;
          });
          workerCount = onlineWorkers.length;
          online = workerCount > 0;
        }
      }
      result.seo = { installed, online, workerCount };
    }

    // 이메일 모니터 상태 (마케팅 워커의 서브 모듈 — 별도 heartbeat 없이 마케팅 워커 상태로 판단)
    if (type === 'email' || type === 'all') {
      // 마케팅 워커가 온라인이면 이메일 모니터도 동작 중으로 판단
      let marketingOnline = result.marketing?.online ?? false;
      let marketingInstalled = result.marketing?.installed ?? false;
      // 마케팅 상태를 아직 조회하지 않은 경우 (type=email 단독 호출)
      if (!result.marketing) {
        const admin = getSupabaseAdmin();
        if (admin) {
          const { data: controlData } = await admin
            .from('marketing_worker_control')
            .select('watchdog_online, last_updated, worker_version')
            .eq('id', 'main')
            .single();
          if (controlData) {
            // seed row로 인한 오탐 방지: worker_version 또는 watchdog_online 으로 설치 판정
            const hasVersion = !!controlData.worker_version;
            const hasHeartbeat = !!controlData.watchdog_online;
            marketingInstalled = hasVersion || hasHeartbeat;

            const lastUpdated = controlData.last_updated ? new Date(controlData.last_updated) : null;
            const isRecent = lastUpdated && (Date.now() - lastUpdated.getTime() < 60_000);
            marketingOnline = !!(controlData.watchdog_online && isRecent);
          }
        }
      }
      result.email = { installed: marketingInstalled, online: marketingOnline };
    }

    // DentWeb 동기화 상태 (dentweb_sync_config 테이블)
    if (type === 'dentweb' || type === 'all') {
      let installed = false;
      let online = false;
      let lastSyncStatus: string | null = null;
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: syncConfig } = await admin
          .from('dentweb_sync_config')
          .select('is_active, last_sync_at, last_sync_status')
          .limit(1)
          .single();

        if (syncConfig) {
          installed = true;
          const lastSync = syncConfig.last_sync_at ? new Date(syncConfig.last_sync_at) : null;
          // 브릿지 에이전트가 60초 주기로 /api/dentweb/heartbeat 를 호출하여 last_sync_at을 갱신한다.
          // heartbeat 여유를 감안해 3분(180초) 이내면 온라인으로 판단.
          online = !!(syncConfig.is_active && lastSync && (Date.now() - lastSync.getTime() < 3 * 60 * 1000));
          lastSyncStatus = syncConfig.last_sync_status;
        }
      }
      result.dentweb = { installed, online, lastSyncStatus };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] workers/status GET:', error);
    return NextResponse.json({ error: '상태 조회 실패' }, { status: 500 });
  }
}
