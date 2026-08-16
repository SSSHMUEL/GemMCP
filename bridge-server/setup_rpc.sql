-- ==============================================================================
-- GemMCP Supabase Security & RPC Setup Script
-- העתק והדבק את הקוד הבא ב-SQL Editor של לוח הבקרה ב-Supabase ולחץ Run.
-- ==============================================================================

-- 1. יצירה והגנה על טבלת הגדרות וסודות (gemmcp_settings)
CREATE TABLE IF NOT EXISTS public.gemmcp_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT UNIQUE NOT NULL,
    api_key TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- הפעלת Row Level Security (RLS) באופן מחמיר
ALTER TABLE public.gemmcp_settings ENABLE ROW LEVEL SECURITY;

-- חסימת כל גישה מפומבי/אנונימי (anon / public)
REVOKE ALL ON public.gemmcp_settings FROM public;
REVOKE ALL ON public.gemmcp_settings FROM anon;

-- מתן הרשאות מלאות רק ל-service_role (השרת המאובטח עם מפתח ה-Secret)
GRANT ALL ON public.gemmcp_settings TO service_role;

-- יצירת Policy שמגביל קריאה וכתיבה רק למשתמשים מאומתים או service_role
DROP POLICY IF EXISTS "Service role full access" ON public.gemmcp_settings;
CREATE POLICY "Service role full access"
    ON public.gemmcp_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- 2. פונקציית exec_sql (להרצת SQL מבוקרת עבור תוסף / שרת ה-Bridge)
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cleaned_query text;
    upper_query text;
    result json;
BEGIN
    IF query IS NULL OR trim(query) = '' THEN
        RETURN json_build_object('status', 'error', 'message', 'Query cannot be empty');
    END IF;

    -- הסרת נקודה-פסיק ורווחים מסוף השאילתה
    cleaned_query := rtrim(rtrim(query), ';');
    upper_query := upper(trim(cleaned_query));

    -- חסימת פקודות מערכת והרסניות ברמת ה-DB
    IF upper_query ~* '\b(DROP\s+DATABASE|DROP\s+SCHEMA|ALTER\s+SYSTEM|CREATE\s+USER|ALTER\s+USER|DROP\s+USER|GRANT|REVOKE)\b'
       OR upper_query ~* '\b(AUTH\.USERS|PG_SHADOW|PG_AUTHID)\b' THEN
        RETURN json_build_object('status', 'error', 'message', 'Security Violation: Restricted SQL statement or sensitive system catalog access.');
    END IF;

    -- אם מדובר בשאילתת שליפה (SELECT או SHOW או WITH או EXPLAIN)
    IF upper_query ~ '^(SELECT|SHOW|WITH|EXPLAIN)' THEN
        EXECUTE 'WITH q AS (' || cleaned_query || ') SELECT json_agg(q) FROM q' INTO result;
        RETURN COALESCE(result, '[]'::json);
    ELSE
        -- פקודות שינוי נתונים או הגדרות (INSERT, UPDATE, DELETE, CREATE וכו')
        EXECUTE cleaned_query;
        RETURN json_build_object('status', 'success', 'message', 'Command executed successfully');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- ביטול הרשאת הרצה מ-public ומתן גישה לתפקידים מורשים בלבד
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM public;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM anon;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;
