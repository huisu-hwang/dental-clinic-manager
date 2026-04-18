'use client'

import { useState, useRef } from 'react'
import { COMPANY } from '@/constants/company'
import FooterTermsModal from './FooterTermsModal'

type ModalType = 'terms' | 'privacy' | null

export default function Footer() {
  const [modal, setModal] = useState<ModalType>(null)
  const termsButtonRef = useRef<HTMLButtonElement>(null)
  const privacyButtonRef = useRef<HTMLButtonElement>(null)

  const activeTriggerRef = modal === 'terms' ? termsButtonRef : privacyButtonRef

  return (
    <>
      <footer className="mt-auto border-t border-at-border bg-at-surface px-4 py-5 text-center text-xs text-at-text-secondary">
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-1.5">
          <span>© {COMPANY.copyrightYear} {COMPANY.name}</span>
          <span className="hidden sm:inline text-at-border" aria-hidden="true">|</span>
          <span>대표이사 {COMPANY.ceo}</span>
          <span className="hidden sm:inline text-at-border" aria-hidden="true">|</span>
          <span>사업자등록번호 {COMPANY.businessRegNumber}</span>
          {COMPANY.mailOrderRegNumber && (
            <>
              <span className="hidden sm:inline text-at-border" aria-hidden="true">|</span>
              <span>통신판매업 {COMPANY.mailOrderRegNumber}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-2">
          <span>{COMPANY.address}</span>
          <span className="hidden sm:inline text-at-border" aria-hidden="true">|</span>
          <span>Tel. {COMPANY.tel}</span>
          <span className="hidden sm:inline text-at-border" aria-hidden="true">|</span>
          <span>{COMPANY.email}</span>
        </div>
        <div className="flex justify-center gap-4">
          <button
            ref={termsButtonRef}
            onClick={() => setModal('terms')}
            className="underline underline-offset-2 hover:text-at-text transition-colors"
          >
            이용약관
          </button>
          <button
            ref={privacyButtonRef}
            onClick={() => setModal('privacy')}
            className="underline underline-offset-2 hover:text-at-text transition-colors font-semibold"
          >
            개인정보처리방침
          </button>
        </div>
      </footer>

      {modal && (
        <FooterTermsModal
          type={modal}
          onClose={() => setModal(null)}
          triggerRef={activeTriggerRef}
        />
      )}
    </>
  )
}
