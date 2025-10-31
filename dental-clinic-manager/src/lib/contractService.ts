/**
 * Employment Contract Service
 * Handles CRUD operations for employment contracts, templates, and signatures
 */

import { getSupabase } from './supabase'
import { clinicHoursService } from './clinicHoursService'
import type {
  EmploymentContract,
  ContractTemplate,
  ContractSignature,
  ContractData,
  ContractFormData,
  ContractListFilters,
  ContractSigningData,
  CreateContractResponse,
  SignContractResponse,
  GetContractsResponse,
  ContractStatus,
  SignerType
} from '@/types/contract'
import type { User } from '@/types/auth'
import { encryptResidentNumber, decryptResidentNumber } from '@/utils/encryptionUtils'

class ContractService {
  private supabase: ReturnType<typeof getSupabase>

  constructor() {
    this.supabase = getSupabase()
  }

  // =====================================================================
  // Contract CRUD Operations
  // =====================================================================

  /**
   * Create a new employment contract
   */
  async createContract(data: ContractFormData, currentUserId: string): Promise<CreateContractResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      // Get employee user data to auto-fill
      const { data: employee, error: employeeError } = await this.supabase
        .from('users')
        .select('id, name, email, phone, address, resident_registration_number, clinic_id')
        .eq('id', data.employee_user_id)
        .single()

      if (employeeError || !employee) {
        return { success: false, error: 'Employee not found' }
      }

      // Get clinic data
      const { data: clinic, error: clinicError } = await this.supabase
        .from('clinics')
        .select('id, name, address, owner_name')
        .eq('id', employee.clinic_id)
        .single()

      if (clinicError || !clinic) {
        return { success: false, error: 'Clinic not found' }
      }

      // Decrypt resident registration number if encrypted
      let residentNumber = employee.resident_registration_number || ''
      if (residentNumber) {
        try {
          const decrypted = await decryptResidentNumber(residentNumber)
          if (decrypted) {
            residentNumber = decrypted
          }
        } catch (e) {
          console.warn('Resident number decryption failed, using as-is')
        }
      }

      // Get clinic hours for weekly work schedule
      const { data: clinicHoursData } = await clinicHoursService.getClinicHours(employee.clinic_id)
      const weeklyWorkHours: Record<number, {
        is_open: boolean
        open_time: string | null
        close_time: string | null
        break_start: string | null
        break_end: string | null
      }> = {}

      if (clinicHoursData) {
        clinicHoursData.forEach(hours => {
          weeklyWorkHours[hours.day_of_week] = {
            is_open: hours.is_open,
            open_time: hours.open_time,
            close_time: hours.close_time,
            break_start: hours.break_start,
            break_end: hours.break_end
          }
        })
      }

      // Prepare contract data with auto-filled employee info
      const contractData = {
        // Auto-filled employee info
        employee_name: employee.name,
        employee_address: employee.address || '',
        employee_phone: employee.phone || '',
        employee_resident_number: residentNumber,

        // Auto-filled employer/clinic info
        employer_name: clinic.owner_name,
        clinic_name: clinic.name,
        clinic_address: clinic.address,

        // Contract data from form
        ...data.contract_data,

        // Weekly work hours from clinic settings
        weekly_work_hours: weeklyWorkHours,

        // Default values
        is_permanent: !data.contract_data.employment_period_end,
        social_insurance: data.contract_data.social_insurance ?? true,
        health_insurance: data.contract_data.health_insurance ?? true,
        employment_insurance: data.contract_data.employment_insurance ?? true,
        pension_insurance: data.contract_data.pension_insurance ?? true,
        workers_compensation: data.contract_data.workers_compensation ?? true,
        confidentiality_agreement: data.contract_data.confidentiality_agreement ?? false,
        non_compete_agreement: data.contract_data.non_compete_agreement ?? false,
        contract_date: new Date().toISOString().split('T')[0],
        contract_location: clinic.address
      } as ContractData

      // Calculate total salary
      const salaryBase = contractData.salary_base || 0
      const salaryBonus = contractData.salary_bonus || 0
      const salaryAllowances = contractData.salary_allowances || {}
      const allowancesTotal = Object.values(salaryAllowances).reduce((sum, val) => sum + (val || 0), 0)
      contractData.salary_total = salaryBase + salaryBonus + allowancesTotal

      // Insert contract
      const { data: contract, error: insertError } = await this.supabase
        .from('employment_contracts')
        .insert({
          clinic_id: employee.clinic_id,
          template_id: data.template_id,
          employee_user_id: data.employee_user_id,
          employer_user_id: currentUserId,
          contract_data: contractData,
          status: 'draft',
          created_by: currentUserId,
          version: 1
        })
        .select()
        .single()

      if (insertError) {
        console.error('Contract insert error:', insertError)
        return { success: false, error: insertError.message }
      }

      return { success: true, contract: contract as EmploymentContract }
    } catch (error) {
      console.error('Create contract error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create contract'
      }
    }
  }

  /**
   * Get a single contract by ID
   */
  async getContract(contractId: string): Promise<{ data: EmploymentContract | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contracts')
        .select(`
          *,
          template:employment_contract_templates(*),
          employee:users!employee_user_id(id, name, email, phone),
          employer:users!employer_user_id(id, name, email),
          signatures:contract_signatures(*)
        `)
        .eq('id', contractId)
        .single()

      if (error) {
        return { data: null, error: error.message }
      }

      return { data: data as unknown as EmploymentContract, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch contract'
      }
    }
  }

  /**
   * Get contracts with filters
   */
  async getContracts(
    clinicId: string,
    filters?: ContractListFilters
  ): Promise<GetContractsResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      let query = this.supabase
        .from('employment_contracts')
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone),
          employer:users!employer_user_id(id, name, email),
          signatures:contract_signatures(id, signer_type, signed_at)
        `, { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }

      if (filters?.employee_user_id) {
        query = query.eq('employee_user_id', filters.employee_user_id)
      }

      if (filters?.employer_user_id) {
        query = query.eq('employer_user_id', filters.employer_user_id)
      }

      if (filters?.date_from) {
        query = query.gte('created_at', filters.date_from)
      }

      if (filters?.date_to) {
        query = query.lte('created_at', filters.date_to)
      }

      if (filters?.search) {
        // Search in contract_data (JSONB field)
        query = query.or(`contract_data->>employee_name.ilike.%${filters.search}%`)
      }

      const { data, error, count } = await query

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        contracts: data as unknown as EmploymentContract[],
        total: count || 0
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch contracts'
      }
    }
  }

  /**
   * Get contracts for a specific user (employee view)
   */
  async getMyContracts(userId: string): Promise<GetContractsResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error, count } = await this.supabase
        .from('employment_contracts')
        .select(`
          *,
          employer:users!employer_user_id(id, name, email),
          signatures:contract_signatures(id, signer_type, signed_at)
        `, { count: 'exact' })
        .eq('employee_user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        contracts: data as unknown as EmploymentContract[],
        total: count || 0
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch contracts'
      }
    }
  }

  /**
   * Update contract data
   */
  async updateContract(
    contractId: string,
    updates: Partial<EmploymentContract>
  ): Promise<CreateContractResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contracts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', contractId)
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, contract: data as EmploymentContract }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update contract'
      }
    }
  }

  /**
   * Update contract status
   */
  async updateContractStatus(
    contractId: string,
    status: ContractStatus
  ): Promise<CreateContractResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      }

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString()
      }

      const { data, error } = await this.supabase
        .from('employment_contracts')
        .update(updateData)
        .eq('id', contractId)
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, contract: data as EmploymentContract }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update contract status'
      }
    }
  }

  /**
   * Cancel contract
   */
  async cancelContract(
    contractId: string,
    cancelledBy: string,
    reason: string
  ): Promise<CreateContractResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contracts')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: cancelledBy,
          cancellation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', contractId)
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, contract: data as EmploymentContract }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel contract'
      }
    }
  }

  // =====================================================================
  // Signature Operations
  // =====================================================================

  /**
   * Sign a contract
   */
  async signContract(data: ContractSigningData): Promise<SignContractResponse> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      // Get current contract
      const { data: contract, error: contractError } = await this.supabase
        .from('employment_contracts')
        .select('*, signatures:contract_signatures(*)')
        .eq('id', data.contract_id)
        .single()

      if (contractError || !contract) {
        return { success: false, error: 'Contract not found' }
      }

      // Check if already signed
      const existingSignature = (contract.signatures as unknown as ContractSignature[])?.find(
        (s: ContractSignature) => s.signer_type === data.signer_type
      )

      if (existingSignature) {
        return { success: false, error: 'Already signed' }
      }

      // Get current user info
      const { data: authUser } = await this.supabase.auth.getUser()
      const currentUserId = authUser?.user?.id

      if (!currentUserId) {
        return { success: false, error: 'Not authenticated' }
      }

      // Insert signature
      const { data: signature, error: signError } = await this.supabase
        .from('contract_signatures')
        .insert({
          contract_id: data.contract_id,
          signer_user_id: currentUserId,
          signer_type: data.signer_type,
          signature_data: data.signature_data,
          signed_at: new Date().toISOString(),
          ip_address: data.ip_address,
          device_info: data.device_info,
          user_agent: data.user_agent,
          is_verified: true
        })
        .select()
        .single()

      if (signError) {
        return { success: false, error: signError.message }
      }

      // Update contract status based on signatures
      const allSignatures = [...(contract.signatures as unknown as ContractSignature[] || []), signature as unknown as ContractSignature]
      const hasEmployerSignature = allSignatures.some((s: ContractSignature) => s.signer_type === 'employer')
      const hasEmployeeSignature = allSignatures.some((s: ContractSignature) => s.signer_type === 'employee')

      let newStatus: ContractStatus = contract.status

      if (hasEmployerSignature && hasEmployeeSignature) {
        newStatus = 'completed'
      } else if (data.signer_type === 'employer') {
        newStatus = 'pending_employee_signature'
      } else if (data.signer_type === 'employee') {
        newStatus = 'pending_employer_signature'
      }

      // Update contract status if changed
      if (newStatus !== contract.status) {
        await this.updateContractStatus(data.contract_id, newStatus)
      }

      return {
        success: true,
        signature: signature as unknown as ContractSignature,
        contract_status: newStatus
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign contract'
      }
    }
  }

  /**
   * Check signature status for a contract
   */
  async getSignatureStatus(contractId: string): Promise<{
    hasEmployerSignature: boolean
    hasEmployeeSignature: boolean
    signatures: ContractSignature[]
  }> {
    if (!this.supabase) {
      return {
        hasEmployerSignature: false,
        hasEmployeeSignature: false,
        signatures: []
      }
    }

    try {
      const { data, error } = await this.supabase
        .from('contract_signatures')
        .select('*')
        .eq('contract_id', contractId)

      if (error || !data) {
        return {
          hasEmployerSignature: false,
          hasEmployeeSignature: false,
          signatures: []
        }
      }

      const signatures = data as ContractSignature[]

      return {
        hasEmployerSignature: signatures.some(s => s.signer_type === 'employer'),
        hasEmployeeSignature: signatures.some(s => s.signer_type === 'employee'),
        signatures
      }
    } catch (error) {
      return {
        hasEmployerSignature: false,
        hasEmployeeSignature: false,
        signatures: []
      }
    }
  }

  // =====================================================================
  // Template Operations
  // =====================================================================

  /**
   * Get all templates for a clinic
   */
  async getTemplates(clinicId: string): Promise<{ data: ContractTemplate[]; error: string | null }> {
    if (!this.supabase) {
      return { data: [], error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contract_templates')
        .select('*')
        .or(`clinic_id.eq.${clinicId},clinic_id.is.null`)
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        return { data: [], error: error.message }
      }

      return { data: data as ContractTemplate[], error: null }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Failed to fetch templates'
      }
    }
  }

  /**
   * Get default template
   */
  async getDefaultTemplate(clinicId?: string): Promise<{ data: ContractTemplate | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Database connection failed' }
    }

    try {
      let query = this.supabase
        .from('employment_contract_templates')
        .select('*')
        .eq('is_default', true)
        .is('deleted_at', null)

      if (clinicId) {
        query = query.or(`clinic_id.eq.${clinicId},clinic_id.is.null`)
      } else {
        query = query.is('clinic_id', null)
      }

      const { data, error } = await query.single()

      if (error) {
        return { data: null, error: error.message }
      }

      return { data: data as ContractTemplate, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch default template'
      }
    }
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(templateId: string): Promise<{ data: ContractTemplate | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contract_templates')
        .select('*')
        .eq('id', templateId)
        .is('deleted_at', null)
        .single()

      if (error) {
        return { data: null, error: error.message }
      }

      return { data: data as ContractTemplate, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch template'
      }
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(
    template: {
      clinic_id: string
      name: string
      description?: string
      content: any
      is_default?: boolean
      version?: string
    },
    currentUserId: string
  ): Promise<{ data: ContractTemplate | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contract_templates')
        .insert({
          ...template,
          created_by: currentUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        return { data: null, error: error.message }
      }

      return { data: data as ContractTemplate, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to create template'
      }
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    templateId: string,
    updates: {
      name?: string
      description?: string
      content?: any
      is_default?: boolean
      version?: string
    }
  ): Promise<{ data: ContractTemplate | null; error: string | null }> {
    if (!this.supabase) {
      return { data: null, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await this.supabase
        .from('employment_contract_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId)
        .is('deleted_at', null)
        .select()
        .single()

      if (error) {
        return { data: null, error: error.message }
      }

      return { data: data as ContractTemplate, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to update template'
      }
    }
  }

  /**
   * Delete a template (soft delete)
   */
  async deleteTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
    if (!this.supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { error } = await this.supabase
        .from('employment_contract_templates')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', templateId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, error: null }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete template'
      }
    }
  }
}

// Export singleton instance
export const contractService = new ContractService()
