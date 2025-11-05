interface StatCardProps {
  title: string
  value: number | string
  unit: string
}

export default function StatCard({ title, value, unit }: StatCardProps) {
  return (
    <div className="bg-slate-50 p-4 rounded-lg border">
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <p className="text-3xl font-bold text-slate-800 mt-1">
        {value}
        <span className="text-xl ml-1">{unit}</span>
      </p>
    </div>
  )
}