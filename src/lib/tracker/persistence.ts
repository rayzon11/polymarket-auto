import { getConfig } from '@/lib/config';
import * as fs from 'fs';
import * as path from 'path';

// Atomic JSON file persistence
// File mode: reads/writes to data/ directory
// Memory mode: uses globalThis maps (for Vercel serverless)

const memoryStore: Map<string, any> = new Map();

export async function readJsonFile<T>(filepath: string, defaultValue: T): Promise<T> {
  const config = getConfig();

  if (config.persistenceMode === 'memory') {
    return memoryStore.get(filepath) ?? defaultValue;
  }

  try {
    const fullPath = path.resolve(config.dataDir, filepath);
    if (!fs.existsSync(fullPath)) return defaultValue;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[Persistence] Failed to read ${filepath}:`, err);
    return defaultValue;
  }
}

export async function writeJsonFile<T>(filepath: string, data: T): Promise<void> {
  const config = getConfig();

  if (config.persistenceMode === 'memory') {
    memoryStore.set(filepath, data);
    return;
  }

  try {
    const fullPath = path.resolve(config.dataDir, filepath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Atomic write: write to temp file, then rename
    const tmpPath = fullPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    console.error(`[Persistence] Failed to write ${filepath}:`, err);
  }
}

export async function appendLogLine(filepath: string, line: string): Promise<void> {
  const config = getConfig();

  if (config.persistenceMode === 'memory') {
    const existing: string[] = memoryStore.get(filepath) || [];
    existing.push(line);
    // Keep last 1000 lines in memory
    if (existing.length > 1000) existing.splice(0, existing.length - 1000);
    memoryStore.set(filepath, existing);
    return;
  }

  try {
    const fullPath = path.resolve(config.dataDir, filepath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(fullPath, line + '\n', 'utf-8');
  } catch (err) {
    console.error(`[Persistence] Failed to append to ${filepath}:`, err);
  }
}

export async function readLogLines(filepath: string, limit = 100): Promise<string[]> {
  const config = getConfig();

  if (config.persistenceMode === 'memory') {
    const lines: string[] = memoryStore.get(filepath) || [];
    return lines.slice(-limit);
  }

  try {
    const fullPath = path.resolve(config.dataDir, filepath);
    if (!fs.existsSync(fullPath)) return [];
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}
