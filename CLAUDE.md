# CLAUDE.md - Dental Clinic Manager Codebase Guide

**Last Updated:** 2025-11-14
**Version:** 1.0
**Purpose:** Comprehensive guide for AI assistants working on this codebase

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Technology Stack](#technology-stack)
4. [Development Workflow](#development-workflow)
5. [Code Conventions & Best Practices](#code-conventions--best-practices)
6. [Database & Data Models](#database--data-models)
7. [Security Guidelines](#security-guidelines)
8. [Authentication & Authorization](#authentication--authorization)
9. [Component Architecture](#component-architecture)
10. [Common Tasks & Commands](#common-tasks--commands)
11. [Important Files & Documentation](#important-files--documentation)
12. [Troubleshooting](#troubleshooting)

---

## Project Overview

### What is Dental Clinic Manager?

**덴탈매니저 (Dental Clinic Manager)** is a multi-tenant SaaS platform for managing dental clinic operations. It provides:

- **Daily reporting system** for patient consultations, recalls, and gifts
- **Statistical analysis** (weekly/monthly/annual)
- **Inventory management** for clinic supplies and gifts
- **Employment contract management** with digital signatures
- **Work schedule and attendance tracking**
- **Treatment protocol management**
- **Multi-tenant architecture** supporting multiple clinics with role-based access

### Target Users

- **Master Admin**: System-wide administrator
- **Owner**: Clinic owner/head dentist
- **Vice Director**: Assistant director
- **Manager**: Clinic manager
- **Team Leader**: Team coordinator
- **Staff**: General desk staff

### Tech Philosophy

- **Type Safety First**: TypeScript strict mode enabled
- **Server-Side Rendering**: Next.js App Router for optimal performance
- **Database-First Security**: Row-Level Security (RLS) for all tables
- **Client-Side Encryption**: Sensitive data encrypted before transmission
- **Mobile-First Design**: Responsive UI with Tailwind CSS

---

## Repository Structure

```
/home/user/dental-clinic-manager/
├── dcm.html                          # Standalone dashboard HTML (legacy)
├── package.json                      # Root package file (minimal)
└── dental-clinic-manager/            # Main Next.js application
    ├── src/
    │   ├── app/                      # Next.js App Router
    │   │   ├── page.tsx              # Landing page
    │   │   ├── layout.tsx            # Root layout
    │   │   ├── AuthApp.tsx           # Main authenticated app component
    │   │   ├── dashboard/            # Dashboard routes
    │   │   │   ├── page.tsx          # Main dashboard
    │   │   │   └── contracts/        # Contract management routes
    │   │   ├── admin/                # Admin panel
    │   │   ├── attendance/           # Attendance tracking
    │   │   ├── management/           # User management
    │   │   ├── master/               # Master admin panel
    │   │   ├── api/                  # API routes
    │   │   │   └── contracts/[id]/   # Contract API endpoints
    │   │   └── actions/              # Server actions
    │   │       └── dailyReport.ts    # Daily report actions
    │   ├── components/               # React components (feature-based)
    │   │   ├── Admin/                # Admin components
    │   │   ├── Protocol/             # Treatment protocol components
    │   │   ├── Contract/             # Employment contract components
    │   │   ├── Attendance/           # Attendance components
    │   │   ├── DailyInput/           # Daily report input components
    │   │   ├── Stats/                # Statistics components
    │   │   ├── Logs/                 # Activity logs components
    │   │   ├── Settings/             # Settings components
    │   │   ├── Auth/                 # Authentication components
    │   │   ├── Layout/               # Layout components
    │   │   ├── Landing/              # Landing page components
    │   │   ├── Management/           # User management components
    │   │   └── ui/                   # Shared UI components (shadcn/ui)
    │   ├── contexts/                 # React contexts
    │   │   └── AuthContext.tsx       # Authentication context
    │   └── utils/                    # Utility functions
    │       ├── dataValidator.ts      # Data validation utilities
    │       ├── dateUtils.ts          # Date formatting utilities
    │       ├── dbInspector.ts        # Database inspection tools
    │       ├── encryptionUtils.ts    # AES-256-GCM encryption
    │       ├── protocolStepUtils.ts  # Protocol step utilities
    │       ├── residentNumberUtils.ts # Resident number validation
    │       ├── statsUtils.ts         # Statistics calculations
    │       └── workScheduleUtils.ts  # Work schedule utilities
    ├── supabase/
    │   ├── migrations/               # Database migration files
    │   │   ├── 001_multi_tenant_schema.sql
    │   │   ├── 002_daily_report_v2_rpc_and_rls.sql
    │   │   ├── 003_fix_qr_code_rls.sql
    │   │   ├── 004_leave_management.sql
    │   │   ├── 20251029_create_employment_contract_tables.sql
    │   │   ├── 20250131_create_clinic_hours.sql
    │   │   └── ...
    │   └── SETUP_CONTRACT_TABLES.sql # Contract tables setup
    ├── docs/                         # Additional documentation
    ├── scripts/                      # Utility scripts
    ├── public/                       # Static assets
    ├── middleware.ts                 # Next.js middleware for auth
    ├── next.config.ts                # Next.js configuration
    ├── tsconfig.json                 # TypeScript configuration
    ├── tailwind.config.ts            # Tailwind CSS configuration
    ├── package.json                  # Dependencies
    ├── PRD.md                        # Product Requirements Document
    ├── WORK_LOG.md                   # Development work log (Context7 format)
    ├── SECURITY.md                   # Security guidelines
    └── README.md                     # Setup and usage guide
```

### Key Directory Responsibilities

- **`src/app/`**: Next.js pages using App Router pattern
- **`src/components/`**: Feature-based component organization
- **`src/contexts/`**: Global state management via React Context
- **`src/utils/`**: Pure utility functions (no React dependencies)
- **`supabase/migrations/`**: Database schema version control

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 15.5.3 | React framework with App Router |
| **React** | 19.1.0 | UI library |
| **TypeScript** | 5.9.3 | Type safety |
| **Tailwind CSS** | 4.x | Styling framework |
| **Lucide React** | 0.544.0 | Icon library |
| **Heroicons** | 2.2.0 | Additional icons |
| **Radix UI** | Various | Accessible component primitives |
| **TipTap** | 3.x | Rich text editor for protocols |
| **@dnd-kit** | 6.x/10.x | Drag-and-drop functionality |

### Backend & Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------|
| **Supabase** | 2.57.4 | PostgreSQL database + Auth + Realtime |
| **PostgreSQL** | Latest | Primary database |
| **Vercel** | - | Deployment platform (recommended) |
| **Node.js** | 20+ | Runtime environment |

### Libraries & Tools

| Library | Purpose |
|---------|---------|
| **html-to-image** | Convert HTML to images for PDFs |
| **jsPDF** | PDF generation (v3 - use named imports!) |
| **html5-qrcode** | QR code scanning |
| **qrcode** | QR code generation |
| **uuid** | Unique ID generation |
| **pg** | Direct PostgreSQL client |

---

## Development Workflow

### Environment Setup

1. **Install dependencies:**
   ```bash
   cd dental-clinic-manager
   npm install
   ```

2. **Configure environment variables:**
   Create `.env.local` in `dental-clinic-manager/`:
   ```env
   # Supabase REST API (Browser Client)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

   # Database Connection (Transaction Mode - Port 6543!)
   # CRITICAL: Use port 6543 for serverless (Vercel)
   DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-[REGION].pooler.supabase.com:6543/postgres

   # Encryption (Generate with: openssl rand -base64 32)
   NEXT_PUBLIC_ENCRYPTION_SALT=your-secure-32-byte-key
   ```

3. **Set up database:**
   ```bash
   # In Supabase SQL Editor, run migrations in order:
   # 1. supabase/migrations/001_multi_tenant_schema.sql
   # 2. supabase/migrations/002_daily_report_v2_rpc_and_rls.sql
   # 3. Continue with numbered migrations...
   ```

4. **Run development server:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

### Development Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)

# Building
npm run build            # Production build
npm run start            # Run production build locally

# Linting
npm run lint             # Run ESLint

# Testing (when added)
npm test                 # Run test suite
```

### Git Workflow

1. **Always work on feature branches:**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Commit with descriptive messages:**
   ```bash
   git add .
   git commit -m "feat: Add employment contract PDF download"
   # or
   git commit -m "fix: Resolve jsPDF v3 import issue"
   ```

3. **Push to origin:**
   ```bash
   git push -u origin feature/your-feature-name
   ```

4. **Create Pull Request:**
   - Use GitHub web interface
   - Reference related issues
   - Add description of changes

### Branch Naming Convention

- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code refactoring
- `docs/*` - Documentation updates
- `test/*` - Test additions/modifications

---

## Code Conventions & Best Practices

### TypeScript Guidelines

1. **Always use TypeScript strict mode** (already enabled in `tsconfig.json`)

2. **Define types for all props:**
   ```typescript
   // ✅ Good
   interface ContractDetailProps {
     contractId: string
     onClose: () => void
   }

   function ContractDetail({ contractId, onClose }: ContractDetailProps) {
     // ...
   }

   // ❌ Bad
   function ContractDetail(props: any) {
     // ...
   }
   ```

3. **Use type inference where obvious:**
   ```typescript
   // ✅ Good
   const [count, setCount] = useState(0)  // number inferred
   const [loading, setLoading] = useState(false)  // boolean inferred

   // ❌ Unnecessary
   const [count, setCount] = useState<number>(0)
   ```

4. **Define return types for complex functions:**
   ```typescript
   // ✅ Good
   async function fetchContract(id: string): Promise<Contract | null> {
     // ...
   }
   ```

### React Component Guidelines

1. **Use functional components with hooks:**
   ```typescript
   // ✅ Good
   function MyComponent() {
     const [state, setState] = useState(initialValue)
     return <div>{state}</div>
   }

   // ❌ Avoid class components
   ```

2. **Component file structure:**
   ```typescript
   // 1. Imports
   import React, { useState } from 'react'
   import { createClient } from '@/utils/supabase/client'

   // 2. Type definitions
   interface MyComponentProps {
     // ...
   }

   // 3. Component
   export default function MyComponent({ ... }: MyComponentProps) {
     // 3a. Hooks
     const [state, setState] = useState()
     const supabase = createClient()

     // 3b. Event handlers
     const handleClick = async () => {
       // ...
     }

     // 3c. Effects
     useEffect(() => {
       // ...
     }, [])

     // 3d. Render
     return (
       // JSX
     )
   }
   ```

3. **Use async/await for Supabase queries:**
   ```typescript
   // ✅ Good
   const { data, error } = await supabase
     .from('contracts')
     .select('*')
     .eq('id', contractId)
     .single()

   if (error) {
     console.error('Error fetching contract:', error)
     return
   }

   // ❌ Bad - don't use .then()
   ```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Components** | PascalCase | `ContractDetail.tsx` |
| **Functions** | camelCase | `handleSubmit()` |
| **Variables** | camelCase | `contractData` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| **Types/Interfaces** | PascalCase | `ContractData` |
| **Files (non-component)** | camelCase | `dateUtils.ts` |
| **Database tables** | snake_case | `employment_contracts` |
| **Database columns** | snake_case | `created_at` |

### Import Organization

```typescript
// 1. External libraries
import React, { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'

// 2. Internal utilities
import { createClient } from '@/utils/supabase/client'
import { formatDate } from '@/utils/dateUtils'

// 3. Components
import Button from '@/components/ui/Button'

// 4. Types
import type { Contract } from '@/types/contract'

// 5. Styles (if separate)
import styles from './MyComponent.module.css'
```

### Error Handling

1. **Always handle Supabase errors:**
   ```typescript
   const { data, error } = await supabase.from('table').select()

   if (error) {
     console.error('Database error:', error.message)
     alert('데이터를 불러오는데 실패했습니다.')
     return
   }
   ```

2. **Use try-catch for complex operations:**
   ```typescript
   try {
     const result = await complexOperation()
   } catch (error) {
     console.error('Operation failed:', error)
     alert(`작업 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
   }
   ```

3. **Provide user-friendly error messages:**
   ```typescript
   // ✅ Good - Korean messages for users
   alert('근로계약서를 저장하는데 실패했습니다.')

   // ❌ Bad - Technical errors for users
   alert('Database connection timeout')
   ```

### Loading States

Always show loading states for async operations:

```typescript
const [isLoading, setIsLoading] = useState(false)

const handleSave = async () => {
  setIsLoading(true)
  try {
    await saveData()
  } finally {
    setIsLoading(false)  // Always reset in finally
  }
}

return (
  <button disabled={isLoading}>
    {isLoading ? '저장 중...' : '저장하기'}
  </button>
)
```

---

## Database & Data Models

### Supabase Connection Modes

**CRITICAL:** Always use **Transaction Mode (Port 6543)** for serverless environments!

| Mode | Port | Use Case |
|------|------|----------|
| **Transaction Mode** | 6543 | ✅ Vercel, serverless, production |
| **Session Mode** | 5432 | ❌ Causes 3-minute timeout issues |

### Core Tables

#### Multi-Tenant Structure

```sql
-- Clinics table (tenant root)
clinics
  ├─ id (uuid, PK)
  ├─ name (text)
  ├─ status (enum: active, suspended, pending)
  └─ created_at (timestamp)

-- Users table (employees)
users
  ├─ id (uuid, PK)
  ├─ clinic_id (uuid, FK -> clinics.id)
  ├─ email (text, unique)
  ├─ name (text)
  ├─ role (enum: owner, vice_director, manager, team_leader, staff)
  ├─ phone (text)
  ├─ address (text) -- Encrypted for privacy
  ├─ resident_registration_number (text) -- AES-256-GCM encrypted
  └─ status (enum: active, inactive, pending)
```

#### Daily Reports

```sql
daily_reports
  ├─ id (uuid, PK)
  ├─ clinic_id (uuid, FK)
  ├─ report_date (date)
  ├─ consult_count (integer)
  ├─ recall_count (integer)
  └─ created_by (uuid, FK -> users.id)

consult_logs
  ├─ id (uuid, PK)
  ├─ report_id (uuid, FK -> daily_reports.id)
  ├─ patient_name (text)
  ├─ consult_content (text)
  ├─ is_proceeding (boolean)
  └─ hold_reason (text, nullable)

gift_logs
  ├─ id (uuid, PK)
  ├─ report_id (uuid, FK)
  ├─ patient_name (text)
  ├─ gift_item (text)
  ├─ review_type (text)
  └─ quantity (integer)
```

#### Employment Contracts

```sql
employment_contracts
  ├─ id (uuid, PK)
  ├─ clinic_id (uuid, FK)
  ├─ employee_id (uuid, FK -> users.id)
  ├─ contract_type (text)
  ├─ start_date (date)
  ├─ end_date (date, nullable)
  ├─ work_schedule (jsonb)
  ├─ signature_image_url (text) -- Employee signature
  ├─ owner_signature_image_url (text) -- Owner signature
  └─ status (enum: draft, active, terminated)

contract_templates
  ├─ id (uuid, PK)
  ├─ clinic_id (uuid, FK)
  ├─ name (text)
  ├─ content (jsonb)
  └─ is_default (boolean)
```

#### Treatment Protocols

```sql
protocols
  ├─ id (uuid, PK)
  ├─ clinic_id (uuid, FK)
  ├─ name (text)
  ├─ description (text)
  └─ steps (jsonb)

protocol_steps
  ├─ id (uuid, PK)
  ├─ protocol_id (uuid, FK)
  ├─ step_number (integer)
  ├─ title (text)
  └─ content (jsonb) -- TipTap JSON format
```

### Row-Level Security (RLS) Patterns

All tables use RLS policies. Common patterns:

1. **Clinic Isolation:**
   ```sql
   -- Users can only access data from their clinic
   CREATE POLICY "Users can view own clinic data"
   ON table_name FOR SELECT
   USING (clinic_id = auth.jwt() ->> 'clinic_id');
   ```

2. **Role-Based Access:**
   ```sql
   -- Only owners can delete
   CREATE POLICY "Only owners can delete"
   ON table_name FOR DELETE
   USING (
     EXISTS (
       SELECT 1 FROM users
       WHERE id = auth.uid()
       AND role = 'owner'
       AND clinic_id = table_name.clinic_id
     )
   );
   ```

3. **Self-Access:**
   ```sql
   -- Users can always access their own data
   CREATE POLICY "Users can view own data"
   ON users FOR SELECT
   USING (id = auth.uid());
   ```

### Database Utilities

Use these helper functions in `src/utils/`:

- **`dbInspector.ts`**: Tools for database schema inspection
- **`dataValidator.ts`**: Validate data before insertion
- **`dateUtils.ts`**: Date formatting and timezone handling

---

## Security Guidelines

### Encryption

**CRITICAL:** Resident registration numbers must be encrypted!

1. **Encrypt before storing:**
   ```typescript
   import { encryptResidentNumber } from '@/utils/encryptionUtils'

   const encrypted = await encryptResidentNumber(residentNumber)

   await supabase.from('users').insert({
     resident_registration_number: encrypted,
     // ...
   })
   ```

2. **Decrypt when displaying:**
   ```typescript
   import { decryptResidentNumber } from '@/utils/encryptionUtils'

   const decrypted = await decryptResidentNumber(encryptedValue)
   ```

3. **Validate format:**
   ```typescript
   import { validateResidentNumber } from '@/utils/residentNumberUtils'

   if (!validateResidentNumber(input)) {
     alert('올바른 주민등록번호 형식이 아닙니다.')
     return
   }
   ```

### Security Checklist

- [ ] **Never log sensitive data** (resident numbers, addresses)
- [ ] **Always encrypt before storing** personal information
- [ ] **Check permissions** before data access
- [ ] **Use RLS policies** for all tables
- [ ] **Validate input** on client and server
- [ ] **Use HTTPS** in production
- [ ] **Rotate encryption keys** periodically
- [ ] **Store keys in secure vaults** (not in git!)

### Encryption Keys

**NEVER commit these to git!**

```bash
# Generate encryption key
openssl rand -base64 32

# Add to .env.local
NEXT_PUBLIC_ENCRYPTION_SALT=<generated-key>
```

See `SECURITY.md` for comprehensive security guidelines.

---

## Authentication & Authorization

### Authentication Flow

1. **Supabase Auth** handles login/signup
2. **Middleware** (`middleware.ts`) protects routes
3. **AuthContext** provides user state globally

### Getting Current User

```typescript
import { useAuth } from '@/contexts/AuthContext'

function MyComponent() {
  const { user, profile } = useAuth()

  if (!user) {
    return <div>로그인이 필요합니다.</div>
  }

  // profile contains: role, clinic_id, name, etc.
  return <div>안녕하세요, {profile?.name}님</div>
}
```

### Role-Based Access

```typescript
import { useAuth } from '@/contexts/AuthContext'

function AdminOnlyFeature() {
  const { profile } = useAuth()

  if (profile?.role !== 'owner' && profile?.role !== 'master') {
    return <div>권한이 없습니다.</div>
  }

  return <div>관리자 전용 기능</div>
}
```

### Permission Levels

| Role | Can Create | Can Edit | Can Delete | Can View Stats |
|------|-----------|----------|------------|----------------|
| **master** | All | All | All | All |
| **owner** | All | All | All | All |
| **vice_director** | Reports | Reports | No | All |
| **manager** | Reports | Reports | No | All |
| **team_leader** | Reports | Own reports | No | Weekly/Monthly |
| **staff** | Reports | No | No | Weekly only |

---

## Component Architecture

### Component Organization

Components are organized by **feature**, not by type:

```
src/components/
├── Admin/           # Admin panel components
├── Attendance/      # Attendance tracking
├── Auth/            # Login, signup, password reset
├── Contract/        # Employment contracts
│   ├── ContractDetail.tsx
│   ├── ContractList.tsx
│   └── ContractForm.tsx
├── DailyInput/      # Daily report input
├── Landing/         # Landing page components
├── Layout/          # App layout components
├── Logs/            # Activity logs
├── Management/      # User management
├── Protocol/        # Treatment protocols
├── Settings/        # Settings pages
├── Stats/           # Statistics and charts
└── ui/              # Shared UI primitives (shadcn/ui)
```

### Shared UI Components

Located in `src/components/ui/`, based on **shadcn/ui**:

- `Button.tsx`
- `Dialog.tsx`
- `Switch.tsx`
- etc.

These are low-level, reusable components. Don't modify unless necessary.

### Creating New Components

1. **Determine the feature area:**
   ```
   Is this for contracts? → components/Contract/
   Is this for stats? → components/Stats/
   Is it a reusable UI element? → components/ui/
   ```

2. **Create the component file:**
   ```typescript
   // src/components/Contract/ContractSignature.tsx
   import { useState } from 'react'

   interface ContractSignatureProps {
     onSave: (signature: string) => void
   }

   export default function ContractSignature({ onSave }: ContractSignatureProps) {
     // Component logic
   }
   ```

3. **Export from index (if using barrel exports):**
   ```typescript
   // src/components/Contract/index.ts
   export { default as ContractDetail } from './ContractDetail'
   export { default as ContractSignature } from './ContractSignature'
   ```

---

## Common Tasks & Commands

### Adding a New Feature

1. **Plan the feature:**
   - Update `PRD.md` if it's a major feature
   - Check `WORK_LOG.md` for similar past work
   - Review database schema needs

2. **Create database migrations:**
   ```sql
   -- supabase/migrations/YYYYMMDD_feature_name.sql
   CREATE TABLE new_table (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     clinic_id UUID REFERENCES clinics(id) NOT NULL,
     -- ...
   );

   -- Add RLS policies
   ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
   ```

3. **Create components:**
   ```bash
   # Create feature directory
   mkdir src/components/NewFeature
   touch src/components/NewFeature/NewFeatureList.tsx
   touch src/components/NewFeature/NewFeatureDetail.tsx
   ```

4. **Add routes:**
   ```bash
   mkdir src/app/new-feature
   touch src/app/new-feature/page.tsx
   ```

5. **Test and document:**
   - Test all user roles
   - Update `WORK_LOG.md` with Context7 format
   - Add to `README.md` if needed

### Fixing Bugs

1. **Reproduce the bug:**
   - Document exact steps
   - Check browser console for errors
   - Check Supabase logs if database-related

2. **Identify root cause using Context7:**
   - Ask "Why?" 5 times (see `WORK_LOG.md` examples)
   - Check library documentation for breaking changes
   - Verify environment variables

3. **Fix and document:**
   - Make minimal changes to fix
   - Add comments explaining the fix
   - Update `WORK_LOG.md` with full Context7 analysis

4. **Prevent regression:**
   - Add validation if input-related
   - Add error handling if error-related
   - Consider adding tests

### Working with PDFs

**IMPORTANT:** This project uses **jsPDF v3**!

```typescript
// ✅ Correct import (v3)
import { jsPDF } from 'jspdf'

// ❌ Wrong import (v2 style)
import jsPDF from 'jspdf'

// Usage
const pdf = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4'
})
```

See `WORK_LOG.md` entry "2025-11-13 [버그 수정] PDF 다운로드 실패" for details.

### Working with Supabase

1. **Client-side queries:**
   ```typescript
   import { createClient } from '@/utils/supabase/client'

   const supabase = createClient()
   const { data, error } = await supabase
     .from('table_name')
     .select('*')
     .eq('clinic_id', clinicId)
   ```

2. **Server-side queries (Server Components):**
   ```typescript
   import { createClient } from '@/utils/supabase/server'

   const supabase = await createClient()
   const { data } = await supabase.from('table_name').select()
   ```

3. **Real-time subscriptions:**
   ```typescript
   useEffect(() => {
     const channel = supabase
       .channel('table_changes')
       .on('postgres_changes', {
         event: '*',
         schema: 'public',
         table: 'table_name',
         filter: `clinic_id=eq.${clinicId}`
       }, (payload) => {
         console.log('Change received!', payload)
       })
       .subscribe()

     return () => {
       supabase.removeChannel(channel)
     }
   }, [clinicId])
   ```

### Database Migrations

1. **Create migration file:**
   ```bash
   touch supabase/migrations/$(date +%Y%m%d)_description.sql
   ```

2. **Write migration:**
   ```sql
   -- Always check if exists before creating
   CREATE TABLE IF NOT EXISTS new_table (...);

   -- Add columns with IF NOT EXISTS
   ALTER TABLE existing_table
   ADD COLUMN IF NOT EXISTS new_column TEXT;

   -- Always enable RLS for new tables
   ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

   -- Create policies
   CREATE POLICY "policy_name" ON new_table
   FOR SELECT USING (...);
   ```

3. **Apply migration:**
   - Copy SQL to Supabase Dashboard > SQL Editor
   - Run and verify
   - Commit migration file to git

---

## Important Files & Documentation

### Must-Read Documentation

| File | Purpose | When to Read |
|------|---------|--------------|
| **`PRD.md`** | Product requirements, feature specs | Before adding features |
| **`README.md`** | Setup guide, deployment | Initial setup |
| **`WORK_LOG.md`** | Development history, bug fixes | When fixing bugs or learning |
| **`SECURITY.md`** | Security guidelines, encryption | When handling personal data |
| **`DATABASE_MIGRATION_PLAN.md`** | Database schema changes | Before DB modifications |
| **`CLAUDE.md`** (this file) | Codebase overview for AI | Always (you're reading it!) |

### Configuration Files

| File | Purpose |
|------|---------|
| **`next.config.ts`** | Next.js configuration |
| **`tsconfig.json`** | TypeScript compiler options |
| **`tailwind.config.ts`** | Tailwind CSS customization |
| **`eslint.config.mjs`** | Linting rules |
| **`middleware.ts`** | Auth middleware, route protection |
| **`.env.local`** | Environment variables (DO NOT COMMIT!) |

### SQL Schema Files

| File | Purpose |
|------|---------|
| **`supabase/migrations/001_multi_tenant_schema.sql`** | Base multi-tenant structure |
| **`supabase/migrations/002_daily_report_v2_rpc_and_rls.sql`** | Daily report system |
| **`supabase/migrations/004_leave_management.sql`** | Leave/vacation tracking |
| **`supabase/migrations/20251029_create_employment_contract_tables.sql`** | Employment contracts |

Run migrations **in order** (001, 002, 003, ...).

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Timeout (3-minute issue)

**Problem:** App works for 2-3 minutes, then database queries fail.

**Cause:** Using Session Mode (port 5432) instead of Transaction Mode.

**Solution:**
```env
# ❌ Wrong (Session Mode - port 5432)
DATABASE_URL=postgresql://...pooler.supabase.com:5432/postgres

# ✅ Correct (Transaction Mode - port 6543)
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
```

#### 2. PDF Download Fails

**Problem:** "PDF를 생성하는 데 실패했습니다" alert.

**Cause:** Wrong jsPDF import (v2 style instead of v3).

**Solution:**
```typescript
// ✅ Correct
import { jsPDF } from 'jspdf'

// ❌ Wrong
import jsPDF from 'jspdf'
```

#### 3. Encryption/Decryption Errors

**Problem:** Cannot decrypt resident registration numbers.

**Causes & Solutions:**
- **Missing key:** Add `NEXT_PUBLIC_ENCRYPTION_SALT` to `.env.local`
- **Wrong key:** Ensure same key used for encrypt/decrypt
- **Corrupted data:** Re-encrypt the data with correct key

#### 4. RLS Policy Blocks Query

**Problem:** Query returns empty even though data exists.

**Causes:**
- User not authenticated
- Wrong `clinic_id` in JWT
- RLS policy too restrictive

**Debug steps:**
```sql
-- Check RLS policies on table
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Temporarily disable RLS (TESTING ONLY!)
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
-- Run query
-- Re-enable RLS
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
```

#### 5. TypeScript Errors After Update

**Problem:** Type errors after updating dependencies.

**Solution:**
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

#### 6. Module Not Found Errors

**Problem:** `Module not found: Can't resolve '@/...'`

**Cause:** Path alias misconfiguration.

**Solution:** Check `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Getting Help

1. **Check existing documentation:**
   - `WORK_LOG.md` for similar past issues
   - `README.md` troubleshooting section
   - `SECURITY.md` for security-related issues

2. **Check Supabase logs:**
   - Dashboard > Logs > API Logs
   - Look for failed queries and error messages

3. **Browser console:**
   - Check for JavaScript errors
   - Check Network tab for failed requests

4. **Database inspection:**
   ```typescript
   import { inspectTableStructure } from '@/utils/dbInspector'

   await inspectTableStructure('table_name')
   ```

---

## Development Philosophy

### Context7 Methodology

This project uses **Context7** for bug fixing:

1. Ask "Why?" repeatedly (usually 5 times) to find root cause
2. Document findings in `WORK_LOG.md`
3. Verify solution with official documentation
4. Record learnings for future reference

**Example from WORK_LOG.md:**
```
Q1: 왜 PDF 다운로드가 실패하는가?
A: new jsPDF({ ... }) 호출 시 TypeError 발생

Q2: 왜 TypeError가 발생하는가?
A: jsPDF가 constructor가 아닌 것으로 인식됨

Q3: 왜 constructor가 아닌 것으로 인식되는가?
A: jsPDF v3에서는 default export가 아닌 named export 방식 사용
```

### Code Review Checklist

Before submitting PR:

- [ ] TypeScript compiles without errors
- [ ] No console errors in browser
- [ ] Tested with multiple user roles
- [ ] Loading states shown for async operations
- [ ] Error messages user-friendly (in Korean)
- [ ] Sensitive data encrypted
- [ ] RLS policies applied to new tables
- [ ] `WORK_LOG.md` updated (if bug fix or major feature)
- [ ] Code follows naming conventions
- [ ] No hardcoded secrets or API keys

---

## Quick Reference

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
DATABASE_URL=postgresql://...6543/postgres  # Port 6543!

# Encryption
NEXT_PUBLIC_ENCRYPTION_SALT=<32-byte-key>
```

### Common Imports

```typescript
// Supabase client
import { createClient } from '@/utils/supabase/client'

// Auth context
import { useAuth } from '@/contexts/AuthContext'

// Encryption
import { encryptResidentNumber, decryptResidentNumber } from '@/utils/encryptionUtils'

// Date utilities
import { formatDate, parseDate } from '@/utils/dateUtils'

// PDF generation
import { jsPDF } from 'jspdf'
import htmlToImage from 'html-to-image'
```

### User Roles

```
master > owner > vice_director > manager > team_leader > staff
```

### Database Port Reference

- **6543** = Transaction Mode ✅ (Use this!)
- **5432** = Session Mode ❌ (Don't use in serverless!)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-14 | 1.0 | Initial CLAUDE.md creation |

---

**Note to AI Assistants:** This document is your comprehensive guide to understanding and working with this codebase. Always refer to this file when:
- Starting a new task
- Fixing bugs
- Adding features
- Reviewing code
- Answering questions about the project

For specific implementation details, always check the source code and existing documentation files (`PRD.md`, `WORK_LOG.md`, `SECURITY.md`).
