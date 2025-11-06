type ClassValue =
  | string
  | number
  | ClassDictionary
  | ClassArray
  | null
  | false
  | undefined

interface ClassDictionary {
  [key: string]: boolean | null | undefined
}

type ClassArray = ClassValue[]

function normalizeClass(value: ClassValue): string {
  if (!value) {
    return ""
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(" ")
  }

  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([className]) => className)
    .join(" ")
}

export function cn(...inputs: ClassValue[]) {
  return inputs
    .map(normalizeClass)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}
