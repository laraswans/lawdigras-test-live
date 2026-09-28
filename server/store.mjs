import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

// Small JSON file store with atomic writes. Good enough for one office; swap for a database later.
export function jsonStore(path) {
  let data;
  async function load() {
    if (data) return data;
    try { data = JSON.parse(await readFile(path, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; data = {}; }
    return data;
  }
  return {
    async get(key) { return (await load())[key]; },
    async set(key, value) {
      const all = await load(); all[key] = value;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(all, null, 2));
      await rename(`${path}.tmp`, path);
    },
  };
}
