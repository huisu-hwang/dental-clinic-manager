/**
 * Utility functions for handling Korean phone numbers
 * Supports mobile (010-XXXX-XXXX), Seoul landline (02-XXXX-XXXX), and regional landlines (0XX-XXX-XXXX)
 */

/**
 * Format phone number with hyphens based on Korean phone number patterns
 * @param value - Raw input (may contain non-numeric characters)
 * @returns Formatted string with hyphens
 * @example
 * formatPhoneNumber('01012345678') // returns '010-1234-5678'
 * formatPhoneNumber('0212345678') // returns '02-1234-5678'
 * formatPhoneNumber('0311234567') // returns '031-123-4567'
 */
export function formatPhoneNumber(value: string): string {
  if (!value) return ''

  // Remove all non-numeric characters
  const cleaned = value.replace(/[^0-9]/g, '')

  if (cleaned.length === 0) return ''

  // Mobile phone: 010, 011, 016, 017, 018, 019
  if (cleaned.startsWith('01')) {
    if (cleaned.length <= 3) {
      return cleaned
    }
    if (cleaned.length <= 7) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
    }
    // 010-XXXX-XXXX (11 digits total)
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`
  }

  // Seoul landline: 02-XXXX-XXXX
  if (cleaned.startsWith('02')) {
    if (cleaned.length <= 2) {
      return cleaned
    }
    if (cleaned.length <= 6) {
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`
    }
    if (cleaned.length <= 9) {
      // 02-XXX-XXXX (9 digits) or partial
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5, 9)}`
    }
    // 02-XXXX-XXXX (10 digits)
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}`
  }

  // Regional landlines: 031, 032, 033, etc. (0XX-XXX-XXXX or 0XX-XXXX-XXXX)
  if (cleaned.startsWith('0')) {
    if (cleaned.length <= 3) {
      return cleaned
    }
    if (cleaned.length <= 6) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
    }
    if (cleaned.length <= 10) {
      // 0XX-XXX-XXXX (10 digits) or partial
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`
    }
    // 0XX-XXXX-XXXX (11 digits)
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`
  }

  // If doesn't start with 0, just return cleaned (shouldn't happen for Korean numbers)
  return cleaned
}

/**
 * Auto-format phone number as user types
 * Automatically adds hyphens based on Korean phone number patterns
 * @param value - Current input value
 * @param cursorPosition - Current cursor position (optional)
 * @returns Object with formatted value and new cursor position
 */
export function autoFormatPhoneNumber(
  value: string,
  cursorPosition?: number
): {
  value: string
  cursorPosition: number
} {
  const prevLength = value.length
  const formatted = formatPhoneNumber(value)
  let newCursorPosition = cursorPosition ?? formatted.length

  // Adjust cursor position if hyphens were added
  if (cursorPosition !== undefined) {
    const cleanedBeforeCursor = value.slice(0, cursorPosition).replace(/[^0-9]/g, '').length
    let digitCount = 0
    for (let i = 0; i < formatted.length; i++) {
      if (formatted[i] !== '-') {
        digitCount++
      }
      if (digitCount === cleanedBeforeCursor) {
        newCursorPosition = i + 1
        break
      }
    }
  }

  return {
    value: formatted,
    cursorPosition: newCursorPosition
  }
}

/**
 * Validate Korean phone number format
 * @param value - Phone number to validate
 * @returns true if valid format, false otherwise
 * @example
 * validatePhoneNumber('010-1234-5678') // returns true
 * validatePhoneNumber('02-1234-5678') // returns true
 * validatePhoneNumber('12345') // returns false
 */
export function validatePhoneNumber(value: string): boolean {
  if (!value) return false

  // Remove hyphens and check
  const cleaned = value.replace(/[^0-9]/g, '')

  // Mobile: 010, 011, 016, 017, 018, 019 + 7-8 digits = 10-11 digits
  if (cleaned.startsWith('01')) {
    return cleaned.length >= 10 && cleaned.length <= 11
  }

  // Seoul: 02 + 7-8 digits = 9-10 digits
  if (cleaned.startsWith('02')) {
    return cleaned.length >= 9 && cleaned.length <= 10
  }

  // Regional: 0XX + 7-8 digits = 10-11 digits
  if (cleaned.startsWith('0')) {
    return cleaned.length >= 10 && cleaned.length <= 11
  }

  return false
}

/**
 * Validate phone number with detailed error message
 * @param value - Phone number to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validatePhoneNumberWithMessage(value: string): {
  isValid: boolean
  error: string | null
} {
  if (!value || value.trim() === '') {
    return {
      isValid: false,
      error: '전화번호를 입력해주세요.'
    }
  }

  const cleaned = value.replace(/[^0-9]/g, '')

  if (cleaned.length === 0) {
    return {
      isValid: false,
      error: '전화번호는 숫자만 입력해주세요.'
    }
  }

  if (!cleaned.startsWith('0')) {
    return {
      isValid: false,
      error: '전화번호는 0으로 시작해야 합니다.'
    }
  }

  if (!validatePhoneNumber(value)) {
    return {
      isValid: false,
      error: '올바른 전화번호 형식을 입력해주세요. (예: 010-1234-5678)'
    }
  }

  return {
    isValid: true,
    error: null
  }
}

/**
 * Get the maximum length for phone number input (with hyphens)
 * @returns Maximum length including hyphens
 */
export function getPhoneMaxLength(): number {
  // Maximum: 010-1234-5678 = 13 characters
  return 13
}
