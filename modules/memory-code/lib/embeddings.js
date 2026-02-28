import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '..', 'data', 'models');

const EMBED_BATCH_SIZE = 32;

let pipeline = null;
let extractor = null;

async function getExtractor() {
  if (extractor) return extractor;

  const { pipeline: createPipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = CACHE_DIR;

  pipeline = createPipeline;
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return extractor;
}

export const VECTOR_DIMS = 384;

export async function embed(text) {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function embedBatch(texts, onProgress) {
  const ext = await getExtractor();
  const results = [];

  // Process in batches for true batched inference
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const output = await ext(batch, { pooling: 'mean', normalize: true });

    // output.data is a flat Float32Array of all vectors concatenated
    // Each vector is VECTOR_DIMS (384) floats
    for (let j = 0; j < batch.length; j++) {
      const start = j * VECTOR_DIMS;
      results.push(Array.from(output.data.slice(start, start + VECTOR_DIMS)));
    }

    if (onProgress) {
      onProgress(results.length, texts.length);
    }
  }

  return results;
}
