'use client'

import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_DAYS = 7
const INSTALLED_KEY = 'pwa-installed'

// ── Module-level state: survives component mount/unmount cycles ──
let _deferredPrompt: BeforeInstallPromptEvent | null = null
let _isInstalled = false
let _isDismissed = false
let _isIOS = false
const _listeners = new Set<() => void>()

function notifyListeners() {
  _listeners.forEach((fn) => fn())
}

// Initialize once on client side (module-level, runs before any component mounts)
if (typeof window !== 'undefined') {
  // Check if already installed (standalone or previously recorded)
  _isInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    localStorage.getItem(INSTALLED_KEY) === 'true'

  // Check iOS
  const ua = navigator.userAgent
  _isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)

  // Check dismiss state
  const dismissedAt = localStorage.getItem(DISMISS_KEY)
  if (dismissedAt) {
    const elapsed = Date.now() - Number(dismissedAt)
    if (elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
      _isDismissed = true
    } else {
      localStorage.removeItem(DISMISS_KEY)
    }
  }

  // Capture beforeinstallprompt event globally (before any component mounts)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    _deferredPrompt = e as BeforeInstallPromptEvent
    notifyListeners()
  })

  // Track successful install
  window.addEventListener('appinstalled', () => {
    _deferredPrompt = null
    _isInstalled = true
    localStorage.setItem(INSTALLED_KEY, 'true')
    notifyListeners()
  })
}

export function useInstallPrompt() {
  // Force re-render when module-level state changes
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1)
    _listeners.add(listener)
    return () => {
      _listeners.delete(listener)
    }
  }, [])

  const installApp = useCallback(async () => {
    if (!_deferredPrompt) return false
    await _deferredPrompt.prompt()
    const { outcome } = await _deferredPrompt.userChoice
    _deferredPrompt = null
    if (outcome === 'accepted') {
      _isInstalled = true
      localStorage.setItem(INSTALLED_KEY, 'true')
    }
    notifyListeners()
    return outcome === 'accepted'
  }, [])

  const dismissBanner = useCallback(() => {
    _isDismissed = true
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    notifyListeners()
  }, [])

  return {
    isInstallable: !!_deferredPrompt,
    isInstalled: _isInstalled,
    isDismissed: _isDismissed,
    isIOS: _isIOS,
    installApp,
    dismissBanner,
  }
}
