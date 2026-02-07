# Polaad Organization Setup

This guide explains how to create the Polaad organization with four teams and an admin user.

## ⚠️ IMPORTANT: Choose Your Setup Method

### **🚀 RECOMMENDED: Use JavaScript Script**
The JS script automatically handles auth user creation and is the easiest method.

### **🔧 ALTERNATIVE: Use SQL Script**
The SQL script requires manual auth user creation first (more complex).

---

## What Gets Created

- **Organization**: Polaad
- **Teams/Departments**: Creative, Marketing, Sales, General2
- **Admin User**: Organization admin with access to all features including Activity/Audit logs
- **Roles**: Complete role system (orgAdmin, contentManager, contentViewer, guest)

## 🚀 Option 1: JavaScript Script (RECOMMENDED - Easiest)

### Why Use This Method?
- ✅ Automatically creates the auth user
- ✅ Handles all setup in one command
- ✅ No manual steps required
- ✅ Best for beginners

### Prerequisites
- Node.js installed
- Environment variables set:
  ```bash
  export SUPABASE_URL="your_supabase_url"
  export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
  ```

### Usage

```bash
cd server

# Using default credentials (admin@polaad.com / PolaadAdmin123!)
node scripts/create-polaad-org.js

# Or specify custom admin credentials
node scripts/create-polaad-org.js --adminEmail admin@polaad.com --adminPassword "YourSecurePassword123!"
```

### What This Does Automatically
1. Creates admin user in Supabase Auth
2. Creates Polaad organization
3. Sets up departments and roles
4. Configures all permissions
5. Ready to use immediately!

### What the Script Does

1. ✅ Creates admin user in Supabase Auth
2. ✅ Creates Polaad organization
3. ✅ Sets up all organization roles and permissions
4. ✅ **Creates FIVE departments**: Creative, Marketing, Sales, General2, **Core**
5. ✅ **Core department** - Restricted admin-only content (member management disabled)
6. ✅ Assigns admin as lead of all departments
7. ✅ Initializes organization and user settings
8. ✅ Sets up proper role-based access control

## 🔧 Option 2: SQL Script (Advanced - Manual Steps Required)

### ⚠️ WARNING: Foreign Key Constraint Issue
If you ran the SQL script and got this error:
```
ERROR: 23503: insert or update on table "app_users" violates foreign key constraint "app_users_id_fkey"
```

This happens because the SQL script tries to create an `app_users` entry for a user that doesn't exist in `auth.users`. **Use the JavaScript script instead** - it's designed to handle this properly.

### Manual SQL Approach (Not Recommended)

If you must use SQL directly (advanced users only):

1. **First**: Create auth user via Supabase Dashboard:
   - Go to Authentication > Users
   - Click "Add user"
   - Email: `admin@polaad.com`
   - Password: `YourSecurePassword123!`
   - Copy the User ID

2. **Then**: Run the simple SQL script:
   ```sql
   -- Option A: Run the simple version (copy and paste the entire contents)
   -- Use the file: frontend/docs/create_polaad_simple.sql

   -- Option B: Or run the full version:
   \i frontend/docs/create_polaad_organization.sql
   ```

   **Note**: Both scripts now use proper PostgreSQL array syntax (`ARRAY['item1', 'item2']`) instead of JSON arrays.

### Why This Method Is Complex
- ❌ Manual auth user creation required
- ❌ User ID must be manually copied
- ❌ Prone to foreign key constraint errors
- ❌ Multiple steps required

**Recommendation**: Use the JavaScript script above instead!

## Admin User Details

- **Email**: admin@polaad.com (or your specified email)
- **Password**: PolaadAdmin123! (or your specified password)
- **Role**: Organization Admin (orgAdmin)
- **Permissions**: Full access including Activity/Audit logs

## Department Structure

```
Polaad Organization
├── Creative (Lead: Admin)        - Creative/design work
├── Marketing (Lead: Admin)       - Marketing materials
├── Sales (Lead: Admin)           - Sales documents
├── General2 (Lead: Admin)        - General/admin content
└── Core (Lead: Admin)            - 🔒 HIGHLY RESTRICTED
    ├── Admin-only content and sensitive files
    ├── 🚫 No edit/manage/delete options shown
    ├── 🚫 Member management completely disabled
    └── 🔐 Maximum security protection
```

## 🔒 Core Department

The **Core** department is a restricted administrative department designed for sensitive content:

### **🎯 Use Cases:**
- **Critical system files** and configurations
- **Executive-level documents** and strategic plans
- **Financial reports** requiring admin-only access
- **HR and personnel records**
- **System administration** and backup files

### **🔐 Security Features:**
- **Admin-only access** - Other teams cannot view content
- **Hidden management options** - No edit/manage/delete buttons shown
- **Disabled member management** - No users can be added/removed
- **Complete isolation** from other departments
- **System integrity protection** - Prevents unauthorized access

### **📁 How to Use:**
1. **Create folders** in Core department for sensitive content
2. **Upload documents** assigned to Core for admin-only access
3. **Only admins** can view and manage Core department content
4. **Cannot add team members** to Core (restricted for security)
5. **Cannot edit or delete** Core department (protected from changes)

### **⚠️ Important Restrictions:**
- **No edit button** - Core department cannot be renamed or modified
- **No manage members** - Cannot add/remove users from Core
- **No delete button** - Core department cannot be deleted
- **Admin-only access** - Only administrators can view content
- **System protection** - Ensures critical content remains secure

## Access Permissions

As Organization Admin, the user can:
- ✅ Access Activity/Audit logs (restricted to admins only)
- ✅ Manage all users and departments
- ✅ Upload and manage documents across all departments
- ✅ Configure organization settings
- ✅ View all documents and folders
- ✅ **Create admin-only content** in Core department (restricted member management)
- ✅ **Maintain system integrity** by controlling Core department access

## Verification

After setup, you can verify the organization was created correctly:

```sql
-- Check organization
SELECT * FROM organizations WHERE name = 'Polaad';

-- Check departments
SELECT d.name, d.lead_user_id, au.display_name as lead_name
FROM departments d
JOIN app_users au ON au.id = d.lead_user_id
WHERE d.org_id = (SELECT id FROM organizations WHERE name = 'Polaad');

-- Check admin user
SELECT ou.role, au.display_name, au.email
FROM organization_users ou
JOIN app_users au ON au.id = ou.user_id
WHERE ou.org_id = (SELECT id FROM organizations WHERE name = 'Polaad');
```

## Next Steps

1. Log in with admin credentials
2. Create additional users if needed
3. Configure department-specific permissions
4. Start uploading documents to different departments

---

**Note**: The Activity sidebar has been restricted to admins only, so only users with orgAdmin role will be able to access audit logs.
