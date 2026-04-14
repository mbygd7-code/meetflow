-- AI 직원별 지식 문서 영구 저장
CREATE TABLE IF NOT EXISTS ai_knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE ai_knowledge_files ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 접근 허용
CREATE POLICY "authenticated_access" ON ai_knowledge_files
  FOR ALL USING (auth.role() = 'authenticated');
