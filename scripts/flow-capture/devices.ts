/**
 * Getting a phone ready to be screenshotted (RAPP-78).
 *
 * A capture must not depend on what happened to be booted, so each pass resolves
 * ITS device by name from `flows/flows.json`, boots it if it is cold, and builds
 * and installs the app if it is missing. Maestro is then always given an
 * explicit `--device`: without it, it grabs the first device it can find, which
 * on this machine is as likely to be another project's emulator.
 */

import path from 'node:path';
import { repoRoot } from './config';
import { log, run, runOrThrow, waitFor } from './shell';

const mobileDir = path.join(repoRoot, 'apps', 'mobile');

interface SimctlDevice {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable?: boolean;
}

/** Boots the named simulator if needed and returns its UDID. */
export async function ensureIosDevice(deviceName: string): Promise<string> {
  const { stdout } = await runOrThrow(['xcrun', 'simctl', 'list', 'devices', '--json']);
  const runtimes = (JSON.parse(stdout) as { devices: Record<string, SimctlDevice[]> }).devices;
  const device = Object.values(runtimes)
    .flat()
    .find((candidate) => candidate.name === deviceName && candidate.isAvailable !== false);

  if (device === undefined) {
    throw new Error(
      `iOS simulator "${deviceName}" not found. Create it in Xcode, or point ` +
        '"devices.ios" in flows/flows.json at one you have.',
    );
  }
  if (device.state !== 'Booted') {
    log(`· booting ${deviceName}`);
    await runOrThrow(['xcrun', 'simctl', 'boot', device.udid]);
    await waitFor(`${deviceName} to boot`, async () => await isIosBooted(device.udid), {
      timeoutMs: 180_000,
    });
  }
  return device.udid;
}

async function isIosBooted(udid: string): Promise<boolean> {
  const { stdout } = await run(['xcrun', 'simctl', 'list', 'devices', '--json']);
  return Object.values((JSON.parse(stdout) as { devices: Record<string, SimctlDevice[]> }).devices)
    .flat()
    .some((device) => device.udid === udid && device.state === 'Booted');
}

/** Starts the named AVD if no emulator is attached and returns its adb serial. */
export async function ensureAndroidDevice(avdName: string): Promise<string> {
  let serial = (await attachedEmulators())[0];

  if (serial === undefined) {
    log(`· starting emulator ${avdName}`);
    Bun.spawn(['emulator', '-avd', avdName], { stdout: 'ignore', stderr: 'ignore' }).unref();
    await waitFor(`${avdName} to appear`, async () => (await attachedEmulators()).length > 0, {
      timeoutMs: 300_000,
      intervalMs: 2000,
    });
    serial = (await attachedEmulators())[0];
    if (serial === undefined) throw new Error(`Emulator ${avdName} never attached`);
  }

  // Outside the branch above on purpose. An emulator someone else started is
  // still an emulator that may be mid-boot, and adb reports it as `device` well
  // before it can install anything. Skipping this wait for an already-attached
  // emulator is what made Maestro fail three flows with "device is still
  // booting", minutes into a run.
  await runOrThrow(['adb', '-s', serial, 'wait-for-device']);
  await waitForAndroidBoot(serial);
  return serial;
}

/**
 * Two signals, because neither is reliable alone across system images: on this
 * project's Pixel 8 image `sys.boot_completed` stays unset long after adb is
 * answering, while `init.svc.bootanim` reports `running` until the device is
 * genuinely usable. Whichever one this image exposes, the strict answer wins.
 */
async function waitForAndroidBoot(serial: string): Promise<void> {
  const getProp = async (name: string): Promise<string> =>
    (await run(['adb', '-s', serial, 'shell', 'getprop', name])).stdout.trim();

  await waitFor(
    `${serial} to finish booting`,
    async () => {
      const [bootAnimation, bootCompleted] = await Promise.all([
        getProp('init.svc.bootanim'),
        getProp('sys.boot_completed'),
      ]);
      if (bootAnimation !== '') return bootAnimation === 'stopped';
      return bootCompleted === '1';
    },
    { timeoutMs: 600_000, intervalMs: 3000 },
  );
}

async function attachedEmulators(): Promise<readonly string[]> {
  const { stdout } = await run(['adb', 'devices']);
  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([serial, state]) => serial?.startsWith('emulator-') === true && state === 'device')
    .map(([serial]) => serial as string);
}

/**
 * Builds and installs the app when it is not on the device yet, so a clean
 * checkout reaches a canvas without a manual step. `--no-bundler` keeps the
 * build from starting its own Metro: the harness owns that, on the port the
 * capture will deep-link to.
 */
export async function ensureIosApp(udid: string, appId: string): Promise<void> {
  const installed = await run(['xcrun', 'simctl', 'get_app_container', udid, appId]);
  if (installed.exitCode === 0) return;
  log('· app not installed on the simulator, building it (first run only, this is slow)');
  await runOrThrow(['bunx', 'expo', 'run:ios', '--device', udid, '--no-bundler'], {
    cwd: mobileDir,
    inherit: true,
  });
}

/**
 * Freezes the status bar so two runs of the same flow differ only where the app
 * differs. Without this every screenshot carries a live clock and a live battery
 * reading, so a re-capture is never comparable and "did this screen change?"
 * cannot be answered by looking at the file.
 */
export async function pinIosStatusBar(udid: string): Promise<void> {
  await run([
    'xcrun',
    'simctl',
    'status_bar',
    udid,
    'override',
    '--time',
    '9:41',
    '--batteryState',
    'charged',
    '--batteryLevel',
    '100',
    '--cellularBars',
    '4',
    '--wifiBars',
    '3',
  ]);
}

/** Android's equivalent: the system UI's own demo mode. */
export async function pinAndroidStatusBar(serial: string): Promise<void> {
  const adb = ['adb', '-s', serial, 'shell'];
  await run([...adb, 'settings', 'put', 'global', 'sysui_demo_allowed', '1']);
  const demo = [...adb, 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command'];
  await run([...demo, 'enter']);
  await run([...demo, 'clock', '-e', 'hhmm', '0941']);
  await run([...demo, 'battery', '-e', 'level', '100', '-e', 'plugged', 'false']);
  await run([...demo, 'network', '-e', 'wifi', 'show', '-e', 'level', '4']);
  await run([...demo, 'network', '-e', 'mobile', 'show', '-e', 'level', '4']);
  await run([...demo, 'notifications', '-e', 'visible', 'false']);
}

/**
 * `localhost` inside an emulator is the emulator, so the deep link that hands
 * the development build its Metro URL would resolve to nothing. `adb reverse`
 * points that port back at the host, which is what `expo run:android` does for
 * you and what a capture that only LAUNCHES the app has to do for itself.
 */
export async function reverseMetroPort(serial: string, port: number): Promise<void> {
  await runOrThrow(['adb', '-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
}

export async function ensureAndroidApp(serial: string, appId: string): Promise<void> {
  const installed = await run(['adb', '-s', serial, 'shell', 'pm', 'path', appId]);
  if (installed.stdout.includes('package:')) return;
  log('· app not installed on the emulator, building it (first run only, this is slow)');
  await runOrThrow(['bunx', 'expo', 'run:android', '--no-bundler'], {
    cwd: mobileDir,
    inherit: true,
  });
}
