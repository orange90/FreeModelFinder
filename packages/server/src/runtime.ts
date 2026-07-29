import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR } from '@freemodelfinder/core';

export const DESKTOP_CONTROL_PROTOCOL = 1;
export const RUNTIME_PATH = join(CONFIG_DIR, 'runtime.json');

export interface RuntimeDescriptor {
  pid: number;
  port: number;
  instanceId: string;
  protocolVersion: number;
  serviceVersion: string;
  startedAt: number;
  controlToken: string;
}

export function createRuntimeIdentity(serviceVersion: string): Omit<RuntimeDescriptor, 'port'> {
  return {
    pid: process.pid,
    instanceId: randomUUID(),
    protocolVersion: DESKTOP_CONTROL_PROTOCOL,
    serviceVersion,
    startedAt: Date.now(),
    controlToken: randomBytes(32).toString('base64url'),
  };
}

export async function writeRuntimeDescriptor(descriptor: RuntimeDescriptor): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const temporary = `${RUNTIME_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, RUNTIME_PATH);
  try {
    await chmod(RUNTIME_PATH, 0o600);
  } catch {
    // Windows uses the current user's ACL instead of POSIX permissions.
  }
}

export async function removeRuntimeDescriptor(instanceId: string): Promise<void> {
  try {
    const current = JSON.parse(await readFile(RUNTIME_PATH, 'utf8')) as RuntimeDescriptor;
    if (current.instanceId !== instanceId) return;
    await unlink(RUNTIME_PATH);
  } catch (error) {
    // Missing, corrupt, or concurrently replaced descriptors must never be deleted blindly.
  }
}
