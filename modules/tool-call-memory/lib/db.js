import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, Utf8, Float64, Float32, FixedSizeList } from 'apache-arrow';
import { fileURLToPath } from 'url';
import path from 'path';
import { VECTOR_DIMS } from './embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'lancedb');
const TABLE_NAME = 'tool_calls';

const SCHEMA = new Schema([
  new Field('id', new Utf8(), true),
  new Field('tool_name', new Utf8(), true),
  new Field('tool_input', new Utf8(), true),
  new Field('success', new Utf8(), true),
  new Field('score', new Float64(), true),
  new Field('error', new Utf8(), true),
  new Field('session_id', new Utf8(), true),
  new Field('timestamp', new Utf8(), true),
  new Field('summary', new Utf8(), true),
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

export async function upsertToolCalls(records) {
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
    tool_name: r.tool_name,
    tool_input: r.tool_input,
    success: r.success,
    score: r.score,
    error: r.error,
    session_id: r.session_id,
    timestamp: r.timestamp,
    summary: r.summary,
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
    tool_name: r.tool_name,
    tool_input: r.tool_input,
    success: r.success,
    score: r.score,
    error: r.error,
    session_id: r.session_id,
    timestamp: r.timestamp,
    summary: r.summary,
  };
}

export async function getCount() {
  const table = await getTable();
  return table.countRows();
}

export async function queryByToolName(toolName) {
  const table = await getTable();
  const count = await table.countRows();
  if (count === 0) return [];

  const escaped = toolName.replace(/'/g, "''");
  const results = await table
    .query()
    .where(`tool_name = '${escaped}'`)
    .toArray();

  return results.map(r => ({
    id: r.id,
    tool_name: r.tool_name,
    tool_input: r.tool_input,
    success: r.success,
    score: r.score,
    error: r.error,
    session_id: r.session_id,
    timestamp: r.timestamp,
    summary: r.summary,
  }));
}
