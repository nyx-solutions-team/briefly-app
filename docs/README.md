# 📚 Frontend Documentation

This directory contains all documentation and development resources for the Briefly frontend application.

## 📁 Structure

```
docs/
├── 📁 api/              # API Documentation
│   ├── backend_api_plan.md      # Backend API specification
│   └── ingestion_pipeline.md    # Document ingestion pipeline
├── 📁 guides/           # Development Guides
│   └── README.md        # General documentation
├── 📁 setup/            # Setup & Configuration
│   ├── ACCESS_CREDENTIALS.md   # Access credentials documentation
│   ├── IP_ALLOWLIST_SETUP.md   # IP allowlist configuration
│   └── POLAAD_SETUP_README.md  # POLAAD setup guide
└── 📁 sql-scripts/     # Database Scripts (55+ files)
    ├── 01_audit_core.sql        # Core audit system
    ├── supabase_schema.sql      # Main database schema
    ├── supabase_policies.sql    # RLS policies
    ├── departments_schema.sql   # Departments setup
    ├── settings_schema.sql      # Settings configuration
    └── ... (50+ more SQL files)
```

## 🔧 Script Categories

### **Core Schema**
- `supabase_schema.sql` - Main database schema
- `supabase_policies.sql` - Row Level Security policies
- `departments_schema.sql` - Department management
- `settings_schema.sql` - Application settings

### **Migrations & Fixes**
- `fix_*.sql` - Bug fixes and corrections
- `debug_*.sql` - Diagnostic scripts
- `performance_optimization*.sql` - Performance improvements

### **Feature Scripts**
- `01_audit_core.sql` - Audit system
- `07_agent_system.sql` - AI agent system
- `folder_*.sql` - Folder management
- `roles_*.sql` - Role-based access control

### **Setup & Maintenance**
- `create_polaad_*.sql` - Organization setup
- `cleanup_*.sql` - Maintenance scripts
- `verify_*.sql` - Verification scripts

## 🚀 Quick Access

- **Setup Guide**: [`setup/IP_ALLOWLIST_SETUP.md`](setup/IP_ALLOWLIST_SETUP.md)
- **API Docs**: [`api/backend_api_plan.md`](api/backend_api_plan.md)
- **Core Schema**: [`sql-scripts/supabase_schema.sql`](sql-scripts/supabase_schema.sql)
- **Credentials**: [`setup/ACCESS_CREDENTIALS.md`](setup/ACCESS_CREDENTIALS.md)

---

**Note**: SQL scripts are organized chronologically and by purpose. Always check dependencies before running scripts in production.
