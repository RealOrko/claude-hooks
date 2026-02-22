import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '..', 'data', 'models');

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

export async function embedBatch(texts) {
  const ext = await getExtractor();
  const output = await ext(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}
