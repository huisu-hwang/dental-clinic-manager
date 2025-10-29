# Security Guidelines

## Personal Information Protection

This application handles sensitive personal information including resident registration numbers (주민등록번호). We implement multiple layers of security to protect this data.

### Encryption

#### Client-Side Encryption
- Resident registration numbers are encrypted using **AES-256-GCM** before being sent to the server
- Encryption happens in the browser using Web Crypto API
- Each encryption uses a unique IV (Initialization Vector) for maximum security

#### Database Encryption
- PostgreSQL's `pgcrypto` extension is enabled for server-side encryption
- Sensitive data can be double-encrypted (client + server) for maximum protection

### Access Control

#### Row-Level Security (RLS)
Strict access policies are enforced at the database level:

| User Role | Can View Own Info | Can View Others' Personal Info |
|-----------|-------------------|--------------------------------|
| **User** | ✅ Full access | ❌ No access |
| **Owner** | ✅ Full access | ✅ Clinic members only |
| **Vice Director** | ✅ Full access | ❌ No access |
| **Manager** | ✅ Full access | ❌ No access |
| **Team Leader** | ✅ Full access | ❌ No access |
| **Staff** | ✅ Full access | ❌ No access |
| **Master Admin** | ✅ Full access | ✅ All users (system-wide) |

#### Personal Information Fields
- **Address**: Visible to user and clinic owner only
- **Resident Registration Number**:
  - Full number: Visible to user themselves only
  - Masked (XXXXXX-X******): Visible to clinic owner
  - Not visible at all: All other roles

### Secure Views

Two database views are provided for safe data access:

1. **`users_basic_info`**: For general staff
   - Includes: name, email, phone, role, status
   - Excludes: address, resident registration number

2. **`users_with_masked_info`**: For owners
   - Includes: all basic info + address + masked resident number
   - Resident number shown as: `XXXXXX-X******`

### Environment Variables

**Required for encryption:**

```bash
# Generate a strong encryption key
NEXT_PUBLIC_ENCRYPTION_SALT=<your-strong-random-key>
```

**How to generate a secure key:**

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using OpenSSL
openssl rand -base64 32
```

### Best Practices

#### For Developers

1. **Never log sensitive data**
   ```typescript
   // ❌ BAD
   console.log('Resident number:', user.resident_registration_number)

   // ✅ GOOD
   console.log('Processing user data...')
   ```

2. **Always encrypt before storing**
   ```typescript
   import { encryptResidentNumber } from '@/utils/encryptionUtils'

   const encrypted = await encryptResidentNumber(residentNumber)
   // Store 'encrypted' in database, not 'residentNumber'
   ```

3. **Use type-safe access**
   ```typescript
   // Check permissions before accessing personal info
   if (user.role === 'owner' || user.id === currentUser.id) {
     // OK to access personal info
   }
   ```

4. **Validate input**
   ```typescript
   import { validateResidentNumber } from '@/utils/residentNumberUtils'

   if (!validateResidentNumber(input)) {
     throw new Error('Invalid format')
   }
   ```

#### For Deployment

1. **Use environment-specific encryption keys**
   - Development: One key
   - Staging: Different key
   - Production: Separate, highly secure key

2. **Store keys in secure vaults**
   - Use AWS Secrets Manager, Azure Key Vault, or similar
   - Never commit keys to version control
   - Rotate keys periodically

3. **Enable HTTPS/TLS**
   - All communication must be encrypted in transit
   - Use HSTS headers

4. **Monitor access logs**
   - Track who accesses sensitive data
   - Alert on suspicious patterns
   - Audit logs are stored in `audit_logs` table

5. **Regular security audits**
   - Review RLS policies
   - Check for data leaks in logs
   - Update dependencies regularly

### Compliance

This implementation follows:
- **Personal Information Protection Act (개인정보보호법)**
- GDPR principles (where applicable)
- Industry best practices for data protection

### Data Retention

- Personal information is stored only as long as necessary
- Users can request deletion of their data
- Clinic owners can delete employee data when employment ends
- Encrypted data is securely erased when deleted

### Incident Response

If a security breach is suspected:

1. Immediately notify the system administrator
2. Rotate encryption keys
3. Audit access logs
4. Notify affected users (legal requirement in Korea)
5. Document the incident

### Security Checklist

Before going to production:

- [ ] Generate strong encryption keys for all environments
- [ ] Store keys in secure vault (not in `.env` files)
- [ ] Enable HTTPS/TLS
- [ ] Review and test RLS policies
- [ ] Set up access logging and monitoring
- [ ] Configure backup encryption
- [ ] Implement key rotation schedule
- [ ] Train staff on data protection policies
- [ ] Prepare incident response plan
- [ ] Conduct security audit
- [ ] Review legal compliance (개인정보보호법)

### Contact

For security concerns, contact: [security contact here]

---

**Last Updated**: 2025-10-29
**Version**: 1.0
