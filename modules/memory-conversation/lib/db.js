import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, Utf8, Float64, Float32, FixedSizeList } from 'apache-arrow';
import { fileURLToPath } from 'url';
import path from 'path';
import { VECTOR_DIMS } from './embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'lancedb');
const TABLE_NAME = 'conversations';

const SCHEMA = new Schema([
  new Field('id', new Utf8(), true),
  new Field('text', new Utf8(), true),
  new Field('timestamp', new Utf8(), true),
  new Field('session_id', new Utf8(), true),
  new Field('exchange_index', new Float64(), true),
  new Field('summary', new Utf8(), true),
  new Field('prompt_preview', new Utf8(), true),
  new Field('user_uuid', new Utf8(), true),
  new Field('assistant_uuid', new Utf8(), true),
  new Field(
    'vector',
    new FixedSizeList(VECTOR_DIMS, new Field('item', new Float32(), true)),
    true,
  ),
]);

let db = null;

async function getDb() {
  if (!db) {
    db = await lancedb.connect(DB_PATH);
  }
  return db;
}

export async function getTable() {
  const conn = await getDb();
  const tables = await conn.tableNames();
  if (tables.includes(TABLE_NAME)) {
    return conn.openTable(TABLE_NAME);
  }
  return conn.createEmptyTable(TABLE_NAME, SCHEMA);
}

export async function upsertExchanges(records) {
  const table = await getTable();
  const count = await table.countRows();

  if (count === 0) {
    await table.add(records);
  } else {
    await table
      .mergeInsert('id')
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(records);
  }
}

export async function search(queryVector, limit = 5, filter = null) {
  const table = await getTable();
  const count = await table.countRows();
  if (count === 0) return [];

  let query = table
    .search(queryVector)
    .distanceType('cosine')
    .limit(Math.min(limit, count));

  if (filter) {
    query = query.where(filter);
  }

  const results = await query.toArray();
  return results.map(r => ({
    id: r.id,
    text: r.text,
    timestamp: r.timestamp,
    session_id: r.session_id,
    exchange_index: r.exchange_index,
    summary: r.summary,
    prompt_preview: r.prompt_preview,
    user_uuid: r.user_uuid,
    assistant_uuid: r.assistant_uuid,
    distance: r._distance,
  }));
}

export async function getById(id) {
  const table = await getTable();
  const escaped = id.replace(/'/g, "''");
  const results = await table
    .query()
    .where(`id = '${escaped}'`)
    .limit(1)
    .toArray();
  if (results.length === 0) return null;
  const r = results[0];
  return {
    id: r.id,
    text: r.text,
    timestamp: r.timestamp,
    session_id: r.session_id,
    exchange_index: r.exchange_index,
    summary: r.summary,
    prompt_preview: r.prompt_preview,
    user_uuid: r.user_uuid,
    assistant_uuid: r.assistant_uuid,
  };
}

export async function getCount() {
  const table = await getTable();
  return table.countRows();
}
