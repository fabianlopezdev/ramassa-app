/**
 * The QA run's own iOS simulators (RAPP-500).
 *
 * The suite used to run on the one simulator other sessions also use. It now
 * runs on "Ramassa QA 1..N": same device type and iOS runtime as the project
 * simulator in `flows/flows.json`, created on first use and kept, booted for the
 * run and shut down after it so they do not hold memory between runs.
 *
 * They are created rather than cloned because `simctl clone` refuses a booted
 * source, and the project simulator is nearly always booted by someone. The
 * app binary is copied from the project simulator, which `ensureIosApp` builds
 * when it is missing, so every QA device runs the same dev client.
 */

import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureIosApp, ensureIosDevice, pinIosStatusBar } from '../flow-capture/devices';
import { log, run, runOrThrow, waitFor } from '../flow-capture/shell';
import { onInterrupt } from './cleanup';

interface SimctlDevice {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable?: boolean;
  readonly deviceTypeIdentifier?: string;
}

interface SimctlList {
  readonly devices: Record<string, SimctlDevice[]>;
}

export function qaDeviceName(index: number): string {
  return `Ramassa QA ${index + 1}`;
}

async function listDevices(): Promise<{ runtime: string; device: SimctlDevice }[]> {
  const { stdout } = await runOrThrow(['xcrun', 'simctl', 'list', 'devices', '--json']);
  return Object.entries((JSON.parse(stdout) as SimctlList).devices).flatMap(([runtime, devices]) =>
    devices.map((device) => ({ runtime, device })),
  );
}

/**
 * A private copy of the dev client from the project simulator. Installing from
 * its container directly races other sessions: their Maestro `clearState`
 * reinstalls the app there, which moves the bundle to a new folder while the
 * copy is being read. Copied with `ditto` (an APFS clone, so it is cheap), and
 * tried again from the new location when the bundle moves underneath.
 */
async function snapshotApp(sourceUdid: string, appId: string): Promise<string> {
  const target = path.join(tmpdir(), 'ramassa-qa-app', `${appId}.app`);
  for (let attempt = 1; ; attempt += 1) {
    const { stdout } = await runOrThrow([
      'xcrun',
      'simctl',
      'get_app_container',
      sourceUdid,
      appId,
    ]);
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    const copy = await run(['ditto', stdout.trim(), target]);
    if (copy.exitCode === 0 && (await Bun.file(path.join(target, 'Info.plist')).exists()))
      return target;
    if (attempt === 3)
      throw new Error(`Could not copy ${appId} from the project simulator: ${copy.stderr}`);
    await Bun.sleep(3000);
  }
}

export interface IosPool {
  readonly udids: readonly string[];
  shutdown(): Promise<void>;
}

/** Creates, boots and installs N QA simulators; returns their UDIDs in shard order. */
export async function prepareIosPool(
  sourceDeviceName: string,
  appId: string,
  count: number,
): Promise<IosPool> {
  const sourceUdid = await ensureIosDevice(sourceDeviceName);
  await ensureIosApp(sourceUdid, appId);
  const all = await listDevices();
  const source = all.find(({ device }) => device.udid === sourceUdid);
  if (source?.device.deviceTypeIdentifier === undefined) {
    throw new Error(`Cannot read the device type of "${sourceDeviceName}"`);
  }
  const appPath = await snapshotApp(sourceUdid, appId);

  const udids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = qaDeviceName(index);
    const existing = all.find(
      ({ device, runtime }) =>
        device.name === name && device.isAvailable !== false && runtime === source.runtime,
    );
    if (existing !== undefined) {
      udids.push(existing.device.udid);
      continue;
    }
    log(`· creating simulator "${name}"`);
    const { stdout } = await runOrThrow([
      'xcrun',
      'simctl',
      'create',
      name,
      source.device.deviceTypeIdentifier,
      source.runtime,
    ]);
    udids.push(stdout.trim());
  }

  const booted = new Set(
    (await listDevices())
      .filter(({ device }) => device.state === 'Booted')
      .map(({ device }) => device.udid),
  );
  const shutdown = async (): Promise<void> => {
    await Promise.all(udids.map(async (udid) => await run(['xcrun', 'simctl', 'shutdown', udid])));
  };
  const unregister = onInterrupt(shutdown);
  try {
    await Promise.all(
      udids.map(async (udid) => {
        if (!booted.has(udid)) {
          await runOrThrow(['xcrun', 'simctl', 'boot', udid]);
        }
        await waitFor(
          `${udid} to boot`,
          async () => (await run(['xcrun', 'simctl', 'bootstatus', udid])).exitCode === 0,
          {
            timeoutMs: 180_000,
            intervalMs: 1000,
          },
        );
        await runOrThrow(['xcrun', 'simctl', 'install', udid, appPath]);
        await pinIosStatusBar(udid);
      }),
    );
  } catch (error) {
    unregister();
    await shutdown();
    throw error;
  }
  log(`· ${udids.length} QA simulators ready (${udids.map((_, i) => qaDeviceName(i)).join(', ')})`);

  return {
    udids,
    shutdown: async () => {
      unregister();
      await shutdown();
    },
  };
}
