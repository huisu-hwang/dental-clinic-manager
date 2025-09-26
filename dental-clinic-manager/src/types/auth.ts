export type UserRole = 'master_admin' | 'owner' | 'vice_director' | 'manager' | 'team_leader' | 'staff'
export type SubscriptionTier = 'basic' | 'professional' | 'enterprise'
export type ClinicStatus = 'active' | 'suspended' | 'cancelled'

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  status: string
  clinic_id?: string
  clinic?: Clinic
  created_at?: string
  updated_at?: string
  last_login_at?: string
  approved_by?: string
  approved_at?: string
}

export interface Clinic {
  id: string
  name: string
  owner_name: string
  address: string
  phone: string
  email: string
  business_number?: string
  description?: string
  logo_url?: string
  subscription_tier: string
  subscription_expires_at?: string
  max_users: number
  is_public: boolean
  allow_join_requests: boolean
  status: string
  created_at: string
  updated_at: string
}

export interface UserInvitation {
  id: string
  clinicId: string
  role: UserRole
  token: string
  invitedBy: string
  expiresAt: Date
  acceptedAt?: Date
  createdAt: Date
}

export interface RolePermission {
  id: string
  role: UserRole
  resource: string
  canCreate: boolean
  canRead: boolean
  canUpdate: boolean
  canDelete: boolean
}

export interface AuditLog {
  id: string
  userId: string
  clinicId: string
  action: string
  resourceType?: string
  resourceId?: string
  details?: Record<string, any>
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

export interface Permission {
  resource: string
  canCreate: boolean
  canRead: boolean
  canUpdate: boolean
  canDelete: boolean
}

export interface AuthContext {
  user: User | null
  clinic: Clinic | null
  permissions: Permission[]
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkPermission: (resource: string, action: 'create' | 'read' | 'update' | 'delete') => boolean
}