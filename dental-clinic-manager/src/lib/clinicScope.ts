export type ClinicScopedRecord = {
  id?: number | string | null
  clinic_id?: string | null
}

const buildClinicFilter = (clinicId: string) => `clinic_id.eq.${clinicId},clinic_id.is.null`

export const applyClinicFilter = <T extends { or: (filter: string) => T }>(
  query: T,
  clinicId?: string | null
): T => {
  if (!clinicId) {
    return query
  }

  return query.or(buildClinicFilter(clinicId))
}

export const ensureClinicIds = <T extends ClinicScopedRecord>(
  records: T[] | null | undefined,
  clinicId: string
): { normalized: T[]; missingIds: Array<number | string> } => {
  const normalized: T[] = []
  const missingIds: Array<number | string> = []

  for (const record of records || []) {
    if (!record) continue

    if (!record.clinic_id) {
      if (record.id !== undefined && record.id !== null) {
        missingIds.push(record.id as number | string)
      }
      normalized.push({ ...(record as Record<string, unknown>), clinic_id: clinicId } as T)
    } else {
      normalized.push(record)
    }
  }

  return { normalized, missingIds }
}

export const backfillClinicIds = async (
  supabaseClient: any,
  table: string,
  clinicId: string,
  ids: Array<number | string>
) => {
  if (!supabaseClient || !clinicId || ids.length === 0) {
    return
  }

  try {
    await supabaseClient
      .from(table)
      .update({ clinic_id: clinicId })
      .in('id', Array.from(new Set(ids)))
  } catch (error) {
    console.error(`[clinicScope] Failed to backfill clinic_id for ${table}:`, error)
  }
}
