import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, Utf8, Float64, Float32, FixedSizeList } from 'apache-arrow';
import { fileURLToPath } from 'url';
import path from 'path';
import { VECTOR_DIMS } from './embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'lancedb');
const TABLE_NAME = 'code_chunks';

const SCHEMA = new Schema([
  new Field('id', new Utf8(), true),
  new Field('file_path', new Utf8(), true),
  new Field('start_line', new Float64(), true),
  new Field('end_line', new Float64(), true),
  new Field('language', new Utf8(), true),
  new Field('text', new Utf8(), true),
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

export async function deleteByFilePrefix(filePathPrefix) {
  const table = await getTable();
  const count = await table.countRows();
  if (count === 0) return;
  const escaped = filePathPrefix.replace(/'/g, "''");
  await table.delete(`file_path LIKE '${escaped}%'`);
}

export async function deleteByFilePath(filePath) {
  const table = await getTable();
  const count = await table.countRows();
  if (count === 0) return;
  const escaped = filePath.replace(/'/g, "''");
  await table.delete(`file_path = '${escaped}'`);
}

export async function deleteByFilePaths(filePaths) {
  if (filePaths.length === 0) return;
  const table = await getTable();
  const count = await table.countRows();
  if (count === 0) return;
  const escaped = filePaths.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
  await table.delete(`file_path IN (${escaped})`);
}

export async function addChunks(records) {
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

export async function search(queryVector, limit = 10, filter = null) {
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
    file_path: r.file_path,
    start_line: r.start_line,
    end_line: r.end_line,
    language: r.language,
    text: r.text,
    distance: r._distance,
  }));
}

export async function getCount() {
  const table = await getTable();
  return table.countRows();
}

export async function getIndexedFiles() {
  const table = await getTable();
  const count = await table.countRows();
  if (count === 0) return [];

  const results = await table.query().select(['file_path']).toArray();
  const unique = [...new Set(results.map(r => r.file_path))];
  return unique.sort();
}
