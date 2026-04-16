-- 009: Shared knowledge (공통 지식) support
-- Sentinel convention: employee_id = '*' means "all AI employees can access this chunk"
-- Existing per-employee rows are unaffected. No schema change; only RPC updates.

-- 1. Vector search RPC: include shared chunks
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
  WHERE c.employee_id = emp_id OR c.employee_id = '*'
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 2. BM25 keyword search RPC: include shared chunks
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
  WHERE (c.employee_id = emp_id OR c.employee_id = '*')
    AND c.bm25_tokens @@ plainto_tsquery('simple', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
