interface StatCardProps {
  title: string
  value: number | string
  unit: string
}

export default function StatCard({ title, value, unit }: StatCardProps) {
  return (
    <div className="bg-at-surface-alt p-4 rounded-2xl border">
      <p className="text-sm text-at-text-secondary font-medium">{title}</p>
      <p className="text-3xl font-bold text-at-text mt-1">
        {value}
        <span className="text-xl ml-1">{unit}</span>
      </p>
    </div>
  )
}