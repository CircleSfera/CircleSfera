-- Create HNSW index for the vector column in post_embeddings to speed up cosine similarity semantic search
CREATE INDEX IF NOT EXISTS post_embeddings_vector_idx 
ON post_embeddings 
USING hnsw (vector vector_cosine_ops);
