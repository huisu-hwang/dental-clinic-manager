'use client'

import { useCallback, useEffect, useState } from 'react'

export type VisitorRole = 'owner' | 'staff'
const STORAGE_KEY = 'clinicmgr.visitor_role'

function isVisitorRole(value: unknown): value is VisitorRole {
  return value === 'owner' || value === 'staff'
}

export function useVisitorRole() {
  const [role, setRoleState] = useState<VisitorRole | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isVisitorRole(stored)) {
        setRoleState(stored)
      }
    } catch {
      // localStorage 접근 실패 시 무시
    }
    setHydrated(true)
  }, [])

  const setRole = useCallback((next: VisitorRole) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 무시
    }
    setRoleState(next)
  }, [])

  const clearRole = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 무시
    }
    setRoleState(null)
  }, [])

  return { role, setRole, clearRole, hydrated }
}
