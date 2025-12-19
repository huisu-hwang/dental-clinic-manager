/**
 * Utility functions for handling Korean resident registration numbers (주민등록번호)
 * Used for employment contract generation
 */

/**
 * Format resident registration number with hyphen
 * @param value - Raw input (may contain non-numeric characters)
 * @returns Formatted string (XXXXXX-XXXXXXX) or empty string
 * @example
 * formatResidentNumber('1234567890123') // returns '123456-7890123'
 * formatResidentNumber('123456-7890123') // returns '123456-7890123'
 */
export function formatResidentNumber(value: string): string {
  if (!value) return ''

  // Remove all non-numeric characters
  const cleaned = value.replace(/[^0-9]/g, '')

  // If less than 6 digits, return as is
  if (cleaned.length <= 6) {
    return cleaned
  }

  // If more than 13 digits, truncate
  const truncated = cleaned.slice(0, 13)

  // Format as XXXXXX-XXXXXXX
  return `${truncated.slice(0, 6)}-${truncated.slice(6)}`
}

/**
 * Validate resident registration number format
 * @param value - Resident registration number to validate
 * @returns true if valid format (13 digits), false otherwise
 * @example
 * validateResidentNumber('123456-7890123') // returns true
 * validateResidentNumber('1234567890123') // returns true
 * validateResidentNumber('12345-678901') // returns false
 */
export function validateResidentNumber(value: string): boolean {
  if (!value) return false

  // Remove hyphen and check length
  const cleaned = value.replace(/[^0-9]/g, '')

  return cleaned.length === 13
}

/**
 * Validate resident registration number with detailed error message
 * @param value - Resident registration number to validate
 * @returns Object with isValid boolean and error message if invalid
 * @example
 * validateResidentNumberWithMessage('123456-7890123')
 * // returns { isValid: true, error: null }
 * validateResidentNumberWithMessage('12345')
 * // returns { isValid: false, error: '주민등록번호는 13자리 숫자여야 합니다.' }
 */
export function validateResidentNumberWithMessage(value: string): {
  isValid: boolean
  error: string | null
} {
  if (!value || value.trim() === '') {
    return {
      isValid: false,
      error: '주민등록번호를 입력해주세요.'
    }
  }

  const cleaned = value.replace(/[^0-9]/g, '')

  if (cleaned.length === 0) {
    return {
      isValid: false,
      error: '주민등록번호는 숫자만 입력해주세요.'
    }
  }

  if (cleaned.length < 13) {
    return {
      isValid: false,
      error: `주민등록번호는 13자리 숫자여야 합니다. (현재 ${cleaned.length}자리)`
    }
  }

  if (cleaned.length > 13) {
    return {
      isValid: false,
      error: '주민등록번호는 13자리를 초과할 수 없습니다.'
    }
  }

  return {
    isValid: true,
    error: null
  }
}

/**
 * Mask resident registration number for display
 * Shows only first 8 characters (XXXXXX-X) and masks the rest
 * @param value - Resident registration number to mask
 * @returns Masked string (XXXXXX-X******) or empty string
 * @example
 * maskResidentNumber('123456-7890123') // returns '123456-7******'
 * maskResidentNumber('1234567890123') // returns '123456-7******'
 */
export function maskResidentNumber(value: string): string {
  if (!value) return ''

  // Format first if needed
  const formatted = formatResidentNumber(value)

  if (formatted.length < 8) {
    return formatted
  }

  // Show XXXXXX-X and mask the rest (6 digits)
  return formatted.slice(0, 8) + '******'
}

/**
 * Parse resident registration number to extract information
 * @param value - Resident registration number
 * @returns Object with parsed information
 * @example
 * parseResidentNumber('900101-1234567')
 * // returns {
 * //   birthYear: 1990,
 * //   birthMonth: 1,
 * //   birthDay: 1,
 * //   genderCode: 1,
 * //   gender: 'male',
 * //   century: '1900s'
 * // }
 */
export function parseResidentNumber(value: string): {
  birthYear: number | null
  birthMonth: number | null
  birthDay: number | null
  genderCode: number | null
  gender: 'male' | 'female' | 'unknown'
  century: string | null
} | null {
  if (!validateResidentNumber(value)) {
    return null
  }

  const cleaned = value.replace(/[^0-9]/g, '')

  // Extract date parts
  const yearPart = parseInt(cleaned.slice(0, 2), 10)
  const month = parseInt(cleaned.slice(2, 4), 10)
  const day = parseInt(cleaned.slice(4, 6), 10)
  const genderCode = parseInt(cleaned.charAt(6), 10)

  // Determine century and full year based on gender code
  // 1,2: 1900s, 3,4: 2000s, 5,6: 1900s (foreigners), 7,8: 2000s (foreigners)
  let century = '1900s'
  let year = 1900 + yearPart

  if ([3, 4, 7, 8].includes(genderCode)) {
    century = '2000s'
    year = 2000 + yearPart
  }

  // Determine gender
  let gender: 'male' | 'female' | 'unknown' = 'unknown'
  if ([1, 3, 5, 7].includes(genderCode)) {
    gender = 'male'
  } else if ([2, 4, 6, 8].includes(genderCode)) {
    gender = 'female'
  }

  return {
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    genderCode,
    gender,
    century
  }
}

/**
 * Check if user has completed personal information required for contracts
 * @param user - User object
 * @returns Object indicating completion status
 */
export function checkPersonalInfoCompletion(user: {
  name?: string
  phone?: string
  address?: string
  resident_registration_number?: string
}): {
  isComplete: boolean
  missingFields: string[]
  missingFieldLabels: string[]
} {
  const missingFields: string[] = []
  const missingFieldLabels: string[] = []

  if (!user.name || user.name.trim() === '') {
    missingFields.push('name')
    missingFieldLabels.push('성명')
  }

  if (!user.phone || user.phone.trim() === '') {
    missingFields.push('phone')
    missingFieldLabels.push('전화번호')
  }

  if (!user.address || user.address.trim() === '') {
    missingFields.push('address')
    missingFieldLabels.push('주소')
  }

  if (!user.resident_registration_number ||
      !validateResidentNumber(user.resident_registration_number)) {
    missingFields.push('resident_registration_number')
    missingFieldLabels.push('주민등록번호')
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    missingFieldLabels
  }
}

/**
 * Sanitize resident registration number input
 * Removes invalid characters and limits length
 * @param value - Raw input value
 * @returns Sanitized value
 */
export function sanitizeResidentNumberInput(value: string): string {
  if (!value) return ''

  // Remove all non-numeric characters except hyphen
  let cleaned = value.replace(/[^0-9-]/g, '')

  // Remove multiple hyphens
  cleaned = cleaned.replace(/-+/g, '-')

  // Remove hyphen if not in correct position
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-')
    if (parts.length === 2 && parts[0].length === 6) {
      // Correct format, limit second part to 7 digits
      cleaned = parts[0] + '-' + parts[1].slice(0, 7)
    } else {
      // Incorrect format, remove hyphen and reformat
      cleaned = cleaned.replace(/-/g, '')
      if (cleaned.length > 6) {
        cleaned = cleaned.slice(0, 6) + '-' + cleaned.slice(6, 13)
      }
    }
  } else {
    // No hyphen, just limit to 13 digits
    cleaned = cleaned.slice(0, 13)
  }

  return cleaned
}

/**
 * Auto-format resident registration number as user types
 * Automatically adds hyphen after 6th digit
 * @param value - Current input value
 * @param cursorPosition - Current cursor position (optional)
 * @returns Object with formatted value and new cursor position
 */
export function autoFormatResidentNumber(
  value: string,
  cursorPosition?: number
): {
  value: string
  cursorPosition: number
} {
  const cleaned = value.replace(/[^0-9]/g, '')
  const prevLength = value.length

  let formatted = ''
  let newCursorPosition = cursorPosition ?? prevLength

  if (cleaned.length <= 6) {
    formatted = cleaned
  } else {
    formatted = cleaned.slice(0, 6) + '-' + cleaned.slice(6, 13)

    // Adjust cursor position if hyphen was added
    if (cursorPosition !== undefined && prevLength < formatted.length) {
      if (cursorPosition >= 6) {
        newCursorPosition = cursorPosition + 1
      }
    }
  }

  return {
    value: formatted,
    cursorPosition: newCursorPosition
  }
}

/**
 * Extract birth date from resident registration number as YYYY-MM-DD string
 * @param value - Resident registration number
 * @returns Birth date string in YYYY-MM-DD format, or empty string if invalid
 * @example
 * getBirthDateFromResidentNumber('900115-1234567') // returns '1990-01-15'
 * getBirthDateFromResidentNumber('010520-3234567') // returns '2001-05-20'
 */
export function getBirthDateFromResidentNumber(value: string): string {
  const parsed = parseResidentNumber(value)

  if (!parsed || !parsed.birthYear || !parsed.birthMonth || !parsed.birthDay) {
    return ''
  }

  const year = parsed.birthYear
  const month = String(parsed.birthMonth).padStart(2, '0')
  const day = String(parsed.birthDay).padStart(2, '0')

  return `${year}-${month}-${day}`
}
