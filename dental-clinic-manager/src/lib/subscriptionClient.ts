export async function countActiveEmployeesClient(): Promise<number> {
  const res = await fetch('/api/staff/active-count')
  if (!res.ok) return 0
  const data = await res.json()
  return data.count ?? 0
}
