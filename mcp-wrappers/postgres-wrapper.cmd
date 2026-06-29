@echo off
set "DB_MAIN_URL=postgresql://neondb_owner:npg_2lOLI5PQzdBn@ep-delicate-flower-aoucm2jy-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
node "C:\Users\8\AppData\Roaming\npm\node_modules\postgres-mcp\dist\index.js" --transport=stdio --access-mode=restricted
