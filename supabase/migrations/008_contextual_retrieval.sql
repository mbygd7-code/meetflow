-- Contextual Retrieval (Anthropic 2024)
-- pgvector + BM25 hybrid search with chunk-level context

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Extend ai_knowledge_files (summary + processed state)
ALTER TABLE ai_knowledge_files
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- 3. Chunk + embedding table
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES ai_knowledge_files(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  chunk_index INT NOT NULL,
  original_text TEXT NOT NULL,
  contextualized_text TEXT NOT NULL,
  embedding VECTOR(1536),
  bm25_tokens TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', contextualized_text)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embedding_idx
  ON ai_knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_bm25_idx
  ON ai_knowledge_chunks USING gin (bm25_tokens);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_employee_idx
  ON ai_knowledge_chunks (employee_id);

-- 5. RLS
ALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON ai_knowledge_chunks;
CREATE POLICY "authenticated_access" ON ai_knowledge_chunks
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. Vector search RPC
CREATE OR REPLACE FUNCTION match_chunks(
  emp_id TEXT,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  original_text TEXT,
  contextualized_text TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    c.id,
    c.file_id,
    c.original_text,
    c.contextualized_text,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM ai_knowledge_chunks c
  WHERE c.employee_id = emp_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 7. BM25 keyword search RPC
CREATE OR REPLACE FUNCTION bm25_chunks(
  emp_id TEXT,
  query_text TEXT,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  original_text TEXT,
  contextualized_text TEXT,
  chunk_index INT,
  rank FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    c.id,
    c.file_id,
    c.original_text,
    c.contextualized_text,
    c.chunk_index,
    ts_rank(c.bm25_tokens, plainto_tsquery('simple', query_text)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.employee_id = emp_id
    AND c.bm25_tokens @@ plainto_tsquery('simple', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
