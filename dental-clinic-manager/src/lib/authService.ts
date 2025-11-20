import { createClient } from './supabase/client'
import type { User, Clinic, Permission, UserRole } from '@/types/auth'

export const authService = {
  getInstance() {
    return this
  },

  async login(email: string, password: string): Promise<{
    success: boolean
    user?: User
    clinic?: Clinic
    permissions?: Permission[]
    token?: string
    error?: string
  }> {
    const supabase = createClient()
    try {
      // Get user by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          clinic:clinics(*)
        `)
        .eq('email', email)
        .single()

      if (userError || !userData) {
        return { success: false, error: 'Invalid email or password' }
      }

      // Check password (simplified for development - use bcrypt in production)
      if ((userData as any).password_hash !== password) {
        return { success: false, error: 'Invalid email or password' }
      }

      // Check if user is active
      if ((userData as any).status !== 'active') {
        if ((userData as any).status === 'pending') {
          return { success: false, error: 'Your account is pending approval' }
        }
        return { success: false, error: 'Your account has been suspended' }
      }

      // Get permissions for the user's role
      const { data: permissions, error: permError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', (userData as any).role)

      if (permError) {
        console.error('Error fetching permissions:', permError)
      }

      // Update last login
      await (supabase as any)
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', (userData as any).id)

      // Create session token (in production, use JWT)
      const token = btoa(JSON.stringify({
        userId: (userData as any).id,
        clinic_id: (userData as any).clinic_id,
        role: (userData as any).role
      }))

      const user: User = {
        id: (userData as any).id,
        email: (userData as any).email,
        name: (userData as any).name,
        phone: (userData as any).phone,
        role: (userData as any).role,
        clinic_id: (userData as any).clinic_id,
        clinic: (userData as any).clinic,
        status: (userData as any).status,
        created_at: (userData as any).created_at,
        updated_at: (userData as any).updated_at,
        last_login_at: (userData as any).last_login_at,
        approved_by: (userData as any).approved_by,
        approved_at: (userData as any).approved_at
      }

      const formattedPermissions: Permission[] = (permissions || []).map((p: any) => ({
        resource: p.resource,
        canCreate: p.can_create,
        canRead: p.can_read,
        canUpdate: p.can_update,
        canDelete: p.can_delete
      }))

      return {
        success: true,
        user,
        clinic: (userData as any).clinic,
        permissions: formattedPermissions,
        token
      }

    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'An error occurred during login' }
    }
  },

  async register(data: {
    email: string
    password: string
    name: string
    phone: string
    clinicName: string
    clinicOwnerName: string
    clinicAddress: string
    clinicPhone: string
    clinicEmail: string
    businessNumber?: string
  }): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    try {
      // 1. Create user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            phone: data.phone
          }
        }
      })

      if (authError) {
        console.error('Auth signup error:', authError)
        return { success: false, error: authError.message || 'Failed to create account' }
      }

      if (!authData.user) {
        return { success: false, error: 'Failed to create user account' }
      }

      // 2. Create clinic
      const { data: clinic, error: clinicError } = await (supabase as any)
        .from('clinics')
        .insert({
          name: data.clinicName,
          owner_name: data.clinicOwnerName,
          address: data.clinicAddress,
          phone: data.clinicPhone,
          email: data.clinicEmail,
          business_number: data.businessNumber,
          subscription_tier: 'basic',
          max_users: 5,
          status: 'active',
          is_public: false,
          allow_join_requests: true
        })
        .select()
        .single()

      if (clinicError || !clinic) {
        console.error('Clinic creation error:', clinicError)
        // If clinic creation fails, we should delete the auth user
        // But Supabase doesn't allow deleting unconfirmed users via client SDK
        return { success: false, error: 'Failed to create clinic' }
      }

      // 3. Create user profile in users table
      const { error: userError } = await (supabase as any)
        .from('users')
        .insert({
          id: authData.user.id, // Use the same ID from Supabase Auth
          email: data.email,
          name: data.name,
          phone: data.phone,
          role: 'owner',
          clinic_id: clinic.id,
          status: 'active',
          approved_at: new Date().toISOString()
        })

      if (userError) {
        // Rollback clinic creation if user creation fails
        await (supabase as any).from('clinics').delete().eq('id', clinic.id)
        console.error('User profile creation error:', userError)
        return { success: false, error: 'Failed to create user profile' }
      }

      return { success: true }

    } catch (error) {
      console.error('Registration error:', error)
      return { success: false, error: 'An error occurred during registration' }
    }
  },

  async inviteUser(data: {
    clinicId: string
    email: string
    role: UserRole
    invitedBy: string
  }): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    try {
      // Check if email already exists in the clinic
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', data.email)
        .eq('clinic_id', data.clinicId)
        .single()

      if (existingUser) {
        return { success: false, error: 'User already exists in this clinic' }
      }

      // Generate invitation token
      const token = btoa(JSON.stringify({
        email: data.email,
        clinicId: data.clinicId,
        role: data.role,
        timestamp: Date.now()
      }))

      // Create invitation
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

      const { error } = await (supabase as any)
        .from('user_invitations')
        .insert({
          clinic_id: data.clinicId,
          email: data.email,
          role: data.role,
          token,
          invited_by: data.invitedBy,
          expires_at: expiresAt.toISOString()
        })

      if (error) {
        console.error('Invitation error:', error)
        return { success: false, error: 'Failed to create invitation' }
      }

      // TODO: Send invitation email with token

      return { success: true }

    } catch (error) {
      console.error('Invite user error:', error)
      return { success: false, error: 'An error occurred while inviting user' }
    }
  },

  async acceptInvitation(data: {
    token: string
    password: string
    name: string
    phone?: string
  }): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    try {
      // Get invitation
      const { data: invitation, error: inviteError } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('token', data.token)
        .single()

      if (inviteError || !invitation) {
        return { success: false, error: 'Invalid or expired invitation' }
      }

      // Check if invitation is expired
      if (new Date((invitation as any).expires_at) < new Date()) {
        return { success: false, error: 'Invitation has expired' }
      }

      // Check if already accepted
      if ((invitation as any).accepted_at) {
        return { success: false, error: 'Invitation has already been accepted' }
      }

      // Store password (simplified for development - hash in production)
      const passwordHash = data.password

      // Create user
      const { error: userError } = await (supabase as any)
        .from('users')
        .insert({
          email: (invitation as any).email,
          password_hash: passwordHash,
          name: data.name,
          phone: data.phone,
          role: (invitation as any).role,
          clinic_id: (invitation as any).clinic_id,
          status: 'active',
          approved_by: (invitation as any).invited_by,
          approved_at: new Date().toISOString()
        })

      if (userError) {
        console.error('User creation error:', userError)
        return { success: false, error: 'Failed to create user account' }
      }

      // Mark invitation as accepted
      await (supabase as any)
        .from('user_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', (invitation as any).id)

      return { success: true }

    } catch (error) {
      console.error('Accept invitation error:', error)
      return { success: false, error: 'An error occurred while accepting invitation' }
    }
  },

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const supabase = createClient()
    if (!supabase) {
      return []
    }

    try {
      // Get user's role
      const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single()

      if (!user) {
        return []
      }

      // Get permissions for the role
      const { data: permissions } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', (user as any).role)

      return (permissions || []).map((p: any) => ({
        resource: p.resource,
        canCreate: p.can_create,
        canRead: p.can_read,
        canUpdate: p.can_update,
        canDelete: p.can_delete
      }))

    } catch (error) {
      console.error('Get permissions error:', error)
      return []
    }
  },

  checkPermission(
    permissions: Permission[],
    resource: string,
    action: 'create' | 'read' | 'update' | 'delete'
  ): boolean {
    const permission = permissions.find(p => p.resource === resource)
    if (!permission) return false

    switch (action) {
      case 'create':
        return permission.canCreate
      case 'read':
        return permission.canRead
      case 'update':
        return permission.canUpdate
      case 'delete':
        return permission.canDelete
      default:
        return false
    }
  }
}