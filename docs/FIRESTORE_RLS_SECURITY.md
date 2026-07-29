# Firestore Row-Level Security (RLS) Policies

## Overview

This document describes the Row-Level Security (RLS) rules that protect user data in Firestore. All collections use the principle of least privilege: deny by default, allow only what is explicitly permitted.

## Security Model

### Authentication
- All collection access requires Firebase authentication (`request.auth != null`)
- Email verification is required for most operations (`email_verified == true`)
- Admins have elevated permissions for management operations

### Authorization
- Users can only read/write their own documents (identified by `ownerId` or `userId`)
- Admins can read and manage any document
- Default deny policy: `match /{document=**} { allow read, write: if false; }`

## Collections and Rules

### Analyses Collection

**Path**: `/analyses/{analysisId}` or `/documents/{docId}/analyses/{analysisId}`

**Security Rules**:
```firestore
match /analyses/{analysisId} {
  allow read: if isOwner(existing().ownerId) || isAdmin();
  allow create: if isSignedIn() && isValidAnalysis(incoming());
  allow update: if isAdmin();
  allow delete: if isOwner(existing().ownerId) || isAdmin();
}
```

**What It Protects**:
- Sensitive financial analysis results
- AI-generated risk assessments
- User-specific insights and metrics
- Private documents uploaded by users

**Attack Vectors Prevented**:

### Cross-User Data Access
**Before**: Any authenticated user could query another user's analyses
```javascript
// VULNERABLE - Would succeed before RLS fix
const doc = await getDoc(doc(db, 'analyses', 'userA_doc_id'));
console.log(doc.data());  // LEAKED: userA's financial data
```

**After**: Only document owner can read their own analyses
```javascript
// Now FAILS with permission denied
const doc = await getDoc(doc(db, 'analyses', 'userA_doc_id'));
// Error: Missing or insufficient permissions
```

### Unauthorized Writes
**Before**: Any authenticated user could modify any analysis
```javascript
// VULNERABLE - Could have succeeded
await updateDoc(doc(db, 'analyses', 'userA_id'), {
  riskLevel: 'low'  // Falsify another user's risk assessment
});
```

**After**: Only admins can modify analyses (users can create new ones)
```javascript
// Now FAILS with permission denied
await updateDoc(doc(db, 'analyses', 'userA_id'), { ... });
```

## Testing RLS

### Test Case 1: User Cannot Read Other's Analyses
```typescript
// User A's context
const userAAnalysis = await getDoc(doc(db, 'analyses', 'analysis_123'));
expect(userAAnalysis.exists()).toBe(true);  // ✅ Can read own

// User B's context
const userBAnalysis = await getDoc(doc(db, 'analyses', 'analysis_123'));
// Should throw: Missing or insufficient permissions
expect(userBAnalysis).toThrow();  // ✅ Cannot read user A's
```

### Test Case 2: User Cannot Modify Other's Analyses
```typescript
// User B attempts to modify User A's analysis
await updateDoc(doc(db, 'analyses', 'userA_analysis_id'), {
  riskLevel: 'low'
});
// Should throw: Missing or insufficient permissions
```

### Test Case 3: User Can Create New Analysis
```typescript
// User A can create their own analysis
const newAnalysis = await addDoc(collection(db, 'analyses'), {
  ownerId: userA.uid,
  documentId: '...',
  riskLevel: 'high',
  // ... other fields
});
expect(newAnalysis.id).toBeDefined();  // ✅ Creation succeeds
```

### Test Case 4: Admin Can Access Any Analysis
```typescript
// Admin can read any user's analysis
const anyAnalysis = await getDoc(doc(db, 'analyses', 'any_analysis_id'));
expect(anyAnalysis.exists()).toBe(true);  // ✅ Admin access granted
```

## Data Structure

### Analysis Document Schema
```typescript
{
  ownerId: string,           // User ID who owns this analysis
  documentId: string,         // Reference to source document
  riskLevel: 'low' | 'medium' | 'high',
  summary: string,           // Executive summary
  key_metrics: Record<string, any>,
  risk_assessment: Array<...>,
  action_items: string[],
  sentiment_score: number,
  entities: string[],
  full_report: string,
  processedAt: Timestamp
}
```

**Critical Fields**:
- `ownerId`: Used to enforce RLS; must match `request.auth.uid` for non-admin writes

## Monitoring and Audit

### Check for Unauthorized Access Attempts
```sql
-- Firestore Audit Logs query to find permission denials
SELECT
  protoPayload.methodName,
  protoPayload.resourceName,
  protoPayload.request.database,
  severity,
  timestamp
FROM `project.dataset.cloudaudit_googleapis_com_activity`
WHERE protoPayload.status.code = 7  -- PERMISSION_DENIED
  AND protoPayload.resourceName LIKE '%/analyses/%'
  AND timestamp > TIMESTAMP_SUB(NOW(), INTERVAL 1 DAY);
```

## Best Practices

1. **Always Include ownerId in Analysis Documents**
   - Every analysis MUST have an `ownerId` field set to the authenticated user's UID
   - The RLS rules depend on this field

2. **Validate Data Before Writing**
   - Use `isValidAnalysis()` function to ensure ownerId matches authenticated user
   - Never trust user input for ownerId; always set it from `request.auth.uid`

3. **Use Firestore Security Rules Console**
   - Test rules in Firebase Console before deploying
   - Use "Simulate" mode to verify specific scenarios

4. **Log Analysis Access**
   - Consider adding audit logging for sensitive analysis reads
   - Track which users access which analyses

## Related Issues

- #154: Firestore analyses collection lacks per-user RLS, allowing cross-user data read

## References

- [Firestore Security Rules Documentation](https://firebase.google.com/docs/firestore/security/start)
- [OWASP: Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)
