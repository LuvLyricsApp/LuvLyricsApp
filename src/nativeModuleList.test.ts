/**
 * Android builds use a checked-in ExpoModulesPackageList.kt instead of the
 * autolinked one, so a new Expo package does nothing on Android until its
 * native module is added there by hand. Forgetting it once (expo-video) made
 * the release APK throw at import and sit on a grey screen. This keeps the
 * list in step with package.json.
 */
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const listPath = path.join(root, 'android/app/src/main/java/expo/modules/ExpoModulesPackageList.kt');

interface ExpoModuleConfig {
  platforms?: string[];
  android?: { modules?: string[] };
}

describe('ExpoModulesPackageList.kt', () => {
  it('lists the Android native module of every Expo package the app depends on', () => {
    const list = fs.readFileSync(listPath, 'utf8');
    const deps = Object.keys((JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies);
    const missing: string[] = [];
    for (const dep of deps) {
      const cfgPath = path.join(root, 'node_modules', dep, 'expo-module.config.json');
      if (!fs.existsSync(cfgPath)) continue;
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as ExpoModuleConfig;
      for (const mod of cfg.android?.modules ?? []) {
        if (!list.includes(`${mod}::class.java`)) missing.push(`${dep} → ${mod}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
