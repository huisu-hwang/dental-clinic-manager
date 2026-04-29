import { createClient } from '@/lib/supabase/client'
import type {
  PatientReferralWithPatients,
  PatientPoint,
  PatientPointBalance,
  ReferralSettings,
  ReferralSmsLog,
  ReferralListFilters,
  ReferralListResponse,
  ReferralKpi,
  PatientSearchResult,
  FamilyCandidate,
  ConfirmedFamily,
  MonthlyStatRow,
} from '@/types/referral'

const supabase = createClient()

export const referralService = {
  async list(clinicId: string, filters: ReferralListFilters = {}): Promise<ReferralListResponse> {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('patient_referrals')
      .select(`
        *,
        referrer:dentweb_patients!patient_referrals_referrer_dentweb_patient_id_fkey (
          id, patient_name, chart_number, phone_number
        ),
        referee:dentweb_patients!patient_referrals_referee_dentweb_patient_id_fkey (
          id, patient_name, chart_number, phone_number, registration_date
        )
      `, { count: 'exact' })
      .eq('clinic_id', clinicId)
      .order('referred_at', { ascending: false })
      .range(from, to)

    if (filters.referrerId) {
      query = query.eq('referrer_dentweb_patient_id', filters.referrerId)
    }
    if (filters.startDate) {
      query = query.gte('referred_at', filters.startDate)
    }
    if (filters.endDate) {
      query = query.lte('referred_at', filters.endDate)
    }
    if (filters.thanksSent === true) {
      query = query.not('thanks_sms_sent_at', 'is', null)
    } else if (filters.thanksSent === false) {
      query = query.is('thanks_sms_sent_at', null)
    }

    const { data, error, count } = await query
    if (error) throw error

    let rows = (data ?? []) as unknown as PatientReferralWithPatients[]

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      rows = rows.filter(r =>
        (r.referrer?.patient_name?.toLowerCase().includes(q)) ||
        (r.referee?.patient_name?.toLowerCase().includes(q)) ||
        (r.referrer?.phone_number?.includes(q)) ||
        (r.referee?.phone_number?.includes(q))
      )
    }

    return {
      rows,
      total: count ?? 0,
      page,
      pageSize,
    }
  },

  async create(input: {
    clinicId: string
    referrerId: string
    refereeId: string
    referredAt?: string
    note?: string
  }) {
    const { data, error } = await supabase
      .from('patient_referrals')
      .insert({
        clinic_id: input.clinicId,
        referrer_dentweb_patient_id: input.referrerId,
        referee_dentweb_patient_id: input.refereeId,
        referred_at: input.referredAt ?? new Date().toISOString().slice(0, 10),
        note: input.note ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, patch: { referred_at?: string; note?: string | null; first_paid_at?: string | null; first_paid_amount?: number | null }) {
    const { data, error } = await supabase
      .from('patient_referrals')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase.from('patient_referrals').delete().eq('id', id)
    if (error) throw error
  },

  async searchPatients(clinicId: string, query: string, limit = 10): Promise<PatientSearchResult[]> {
    const q = query.trim()
    if (!q) return []
    const orFilter = `patient_name.ilike.%${q}%,chart_number.ilike.%${q}%,phone_number.ilike.%${q}%`
    const { data, error } = await supabase
      .from('dentweb_patients')
      .select('id, patient_name, chart_number, phone_number, birth_date, acquisition_channel, registration_date')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .or(orFilter)
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async listReferralsByPatient(clinicId: string, dentwebPatientId: string) {
    const { data: outgoing, error: outErr } = await supabase
      .from('patient_referrals')
      .select(`
        *,
        referee:dentweb_patients!patient_referrals_referee_dentweb_patient_id_fkey (
          id, patient_name, chart_number, phone_number, registration_date
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('referrer_dentweb_patient_id', dentwebPatientId)
      .order('referred_at', { ascending: false })
    if (outErr) throw outErr

    const { data: incoming, error: inErr } = await supabase
      .from('patient_referrals')
      .select(`
        *,
        referrer:dentweb_patients!patient_referrals_referrer_dentweb_patient_id_fkey (
          id, patient_name, chart_number, phone_number
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('referee_dentweb_patient_id', dentwebPatientId)
      .maybeSingle()
    if (inErr && inErr.code !== 'PGRST116') throw inErr

    return { outgoing: outgoing ?? [], incoming: incoming ?? null }
  },

  async kpi(clinicId: string): Promise<ReferralKpi> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

    const [{ count: monthlyCount }, { count: prevMonthlyCount }, allTimeRes, pendingRes] = await Promise.all([
      supabase.from('patient_referrals').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).gte('referred_at', monthStart),
      supabase.from('patient_referrals').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).gte('referred_at', prevMonthStart).lte('referred_at', prevMonthEnd),
      supabase.from('patient_referrals')
        .select('referrer_dentweb_patient_id, first_paid_at, referrer:dentweb_patients!patient_referrals_referrer_dentweb_patient_id_fkey(id, patient_name)')
        .eq('clinic_id', clinicId),
      supabase.from('dentweb_patients').select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).eq('acquisition_channel', '소개')
        .gte('registration_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    ])

    const all = (allTimeRes.data ?? []) as Array<{ referrer_dentweb_patient_id: string; first_paid_at: string | null; referrer: { id: string; patient_name: string } | null }>

    const counts = new Map<string, { name: string; count: number }>()
    let paidCount = 0
    for (const r of all) {
      if (r.first_paid_at) paidCount++
      const key = r.referrer_dentweb_patient_id
      const cur = counts.get(key)
      if (cur) cur.count++
      else counts.set(key, { name: r.referrer?.patient_name ?? '?', count: 1 })
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1].count - a[1].count)[0]
    const linkedPending = await supabase.from('patient_referrals').select('referee_dentweb_patient_id')
      .eq('clinic_id', clinicId)
    const linkedSet = new Set(((linkedPending.data ?? []) as Array<{ referee_dentweb_patient_id: string }>).map(r => r.referee_dentweb_patient_id))

    let pendingCount = 0
    if (pendingRes.count) {
      const { data: pendingPatients } = await supabase.from('dentweb_patients').select('id')
        .eq('clinic_id', clinicId).eq('acquisition_channel', '소개')
        .gte('registration_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      pendingCount = ((pendingPatients ?? []) as Array<{ id: string }>).filter(p => !linkedSet.has(p.id)).length
    }

    return {
      monthly_count: monthlyCount ?? 0,
      monthly_count_prev: prevMonthlyCount ?? 0,
      top_referrer: top ? { dentweb_patient_id: top[0], patient_name: top[1].name, referral_count: top[1].count } : null,
      conversion_rate: all.length > 0 ? Math.round((paidCount / all.length) * 1000) / 10 : 0,
      pending_link_count: pendingCount,
    }
  },

  async ranking(clinicId: string, range: 'month' | 'all', limit = 10) {
    let q = supabase
      .from('patient_referrals')
      .select(`
        referrer_dentweb_patient_id,
        referrer:dentweb_patients!patient_referrals_referrer_dentweb_patient_id_fkey (
          id, patient_name, chart_number, phone_number
        )
      `)
      .eq('clinic_id', clinicId)
    if (range === 'month') {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      q = q.gte('referred_at', start)
    }
    const { data, error } = await q
    if (error) throw error
    const map = new Map<string, { id: string; patient_name: string; chart_number: string | null; count: number }>()
    for (const row of (data ?? []) as Array<{ referrer_dentweb_patient_id: string; referrer: { id: string; patient_name: string; chart_number: string | null; phone_number: string | null } | null }>) {
      if (!row.referrer) continue
      const cur = map.get(row.referrer_dentweb_patient_id)
      if (cur) cur.count++
      else map.set(row.referrer_dentweb_patient_id, {
        id: row.referrer.id,
        patient_name: row.referrer.patient_name,
        chart_number: row.referrer.chart_number,
        count: 1,
      })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, limit)
  },

  async getBalance(clinicId: string, dentwebPatientId: string): Promise<number> {
    const { data, error } = await supabase
      .from('patient_point_balance')
      .select('balance')
      .eq('clinic_id', clinicId)
      .eq('dentweb_patient_id', dentwebPatientId)
      .maybeSingle()
    if (error) throw error
    return data?.balance ?? 0
  },

  async getBalances(clinicId: string, dentwebPatientIds: string[]): Promise<Record<string, number>> {
    if (dentwebPatientIds.length === 0) return {}
    const { data, error } = await supabase
      .from('patient_point_balance')
      .select('dentweb_patient_id, balance')
      .eq('clinic_id', clinicId)
      .in('dentweb_patient_id', dentwebPatientIds)
    if (error) throw error
    const map: Record<string, number> = {}
    for (const r of (data ?? []) as Array<{ dentweb_patient_id: string; balance: number }>) {
      map[r.dentweb_patient_id] = r.balance
    }
    return map
  },

  async addPoints(input: {
    clinicId: string
    dentwebPatientId: string
    delta: number
    reason: PatientPoint['reason']
    referralId?: string
    note?: string
  }): Promise<PatientPoint> {
    const { data, error } = await supabase
      .from('patient_points')
      .insert({
        clinic_id: input.clinicId,
        dentweb_patient_id: input.dentwebPatientId,
        delta: input.delta,
        reason: input.reason,
        referral_id: input.referralId ?? null,
        note: input.note ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data as PatientPoint
  },

  async listPointHistory(clinicId: string, dentwebPatientId: string): Promise<PatientPoint[]> {
    const { data, error } = await supabase
      .from('patient_points')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('dentweb_patient_id', dentwebPatientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as PatientPoint[]
  },

  async getSettings(clinicId: string): Promise<ReferralSettings | null> {
    const { data, error } = await supabase
      .from('referral_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (error) throw error
    return data as ReferralSettings | null
  },

  async updateSettings(clinicId: string, patch: Partial<ReferralSettings>): Promise<ReferralSettings> {
    const { data, error } = await supabase
      .from('referral_settings')
      .update(patch)
      .eq('clinic_id', clinicId)
      .select()
      .single()
    if (error) throw error
    return data as ReferralSettings
  },

  async listSmsLogs(clinicId: string, referralId?: string): Promise<ReferralSmsLog[]> {
    let q = supabase
      .from('referral_sms_logs')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('sent_at', { ascending: false })
      .limit(100)
    if (referralId) q = q.eq('referral_id', referralId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as ReferralSmsLog[]
  },

  async getThanksTemplate(clinicId: string) {
    const { data, error } = await supabase
      .from('recall_sms_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('name', '소개 감사 인사')
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async listGiftCategories(clinicId: string) {
    const { data, error } = await supabase
      .from('gift_categories')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('display_order', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async logGift(input: {
    clinicId: string
    dentwebPatientId: string
    patientName: string
    categoryId: number
    giftType: string
    quantity: number
    notes?: string
    referralId?: string
    date?: string
  }) {
    const { data, error } = await supabase
      .from('gift_logs')
      .insert({
        clinic_id: input.clinicId,
        dentweb_patient_id: input.dentwebPatientId,
        patient_name: input.patientName,
        category_id: input.categoryId,
        gift_type: input.giftType,
        quantity: input.quantity,
        notes: input.notes ?? null,
        referral_id: input.referralId ?? null,
        date: input.date ?? new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async suggestFamilies(clinicId: string, limit = 30): Promise<FamilyCandidate[]> {
    const { data, error } = await supabase.rpc('suggest_family_groups', {
      p_clinic_id: clinicId,
      p_limit: limit,
    })
    if (error) throw error
    return (data ?? []) as FamilyCandidate[]
  },

  async confirmFamily(input: { clinicId: string; familyName: string; memberIds: string[] }) {
    const { data: family, error: famErr } = await supabase
      .from('patient_families')
      .insert({ clinic_id: input.clinicId, family_name: input.familyName })
      .select()
      .single()
    if (famErr) throw famErr

    const rows = input.memberIds.map(id => ({ family_id: family.id, dentweb_patient_id: id }))
    const { error: memErr } = await supabase.from('patient_family_members').insert(rows)
    if (memErr) throw memErr
    return family
  },

  async listConfirmedFamilies(clinicId: string): Promise<ConfirmedFamily[]> {
    const { data, error } = await supabase
      .from('patient_families')
      .select(`
        id, family_name, created_at,
        members:patient_family_members (
          relation_label,
          patient:dentweb_patients (id, patient_name, birth_date, chart_number, gender)
        )
      `)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
    if (error) throw error
    type Row = {
      id: string
      family_name: string
      created_at: string
      members: Array<{
        relation_label: string | null
        patient: { id: string; patient_name: string; birth_date: string | null; chart_number: string | null; gender: string | null } | null
      }>
    }
    return ((data ?? []) as Row[]).map(f => ({
      id: f.id,
      family_name: f.family_name,
      created_at: f.created_at,
      members: f.members
        .filter(m => m.patient)
        .map(m => ({
          ...(m.patient as NonNullable<typeof m.patient>),
          relation_label: m.relation_label,
        })),
    }))
  },

  async deleteFamily(familyId: string) {
    const { error } = await supabase.from('patient_families').delete().eq('id', familyId)
    if (error) throw error
  },

  async monthlyStats(clinicId: string, months = 12): Promise<MonthlyStatRow[]> {
    const { data, error } = await supabase.rpc('referral_monthly_stats', {
      p_clinic_id: clinicId,
      p_months: months,
    })
    if (error) throw error
    return (data ?? []) as MonthlyStatRow[]
  },

  async listGiftsByPatient(clinicId: string, dentwebPatientId: string) {
    const { data, error } = await supabase
      .from('gift_logs')
      .select('*, category:gift_categories(id, name, color)')
      .eq('clinic_id', clinicId)
      .eq('dentweb_patient_id', dentwebPatientId)
      .order('date', { ascending: false })
    if (error) throw error
    return data ?? []
  },
}

export type ReferralService = typeof referralService
