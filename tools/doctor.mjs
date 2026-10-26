import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const candidates = [process.env.DEVECO_SDK_HOME, process.env.OHOS_SDK_HOME, process.env.OHOS_CLT,
  path.join(root, '.tools/clt-26/command-line-tools'), path.join(root, '.tools/DevEcoStudio-26'),
  'C:/Program Files/Huawei/DevEco Studio', 'D:/DevEco Studio', 'C:/Huawei/DevEco Studio', 'D:/Huawei/DevEco Studio'].filter(Boolean);
const found = [];
for (const candidate of candidates) { try { await access(candidate); found.push(candidate); } catch {} }
const clt = process.env.OHOS_CLT || path.join(root, '.tools/clt-26/command-line-tools');
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const sdkFile = path.join(clt, 'sdk/default/openharmony/ets/oh-uni-package.json');
const sdk = await exists(sdkFile) ? JSON.parse(await readFile(sdkFile, 'utf8')) : null;
const buildFile = path.join(root, 'reports/native-build.json');
const build = await exists(buildFile) ? JSON.parse(await readFile(buildFile, 'utf8')) : null;
const studio = (await Promise.all(found.map(async candidate => await exists(path.join(candidate, 'product-info.json')) ? candidate : null))).find(Boolean);
const report = {
  node: process.version,
  availableToolRoots: found,
  harmonySdk: sdk ? { version: sdk.version, apiVersion: sdk.apiVersion, root: path.join(clt, 'sdk') } : 'NOT_FOUND',
  hdc: await exists(path.join(clt, 'sdk/default/openharmony/toolchains/hdc.exe')) ? 'INSTALLED; see native-build.json for last device probe' : 'NOT_FOUND',
  studio: studio || 'NOT_FOUND',
  codeGenieBundled: studio ? await exists(path.join(studio, 'plugins/codegenie-plugin')) : false,
  nativeBuild: build?.status || 'NOT_RUN',
  deviceVerification: build?.deviceVerification || 'NOT_RUN',
  nextStep: sdk ? 'Scan a fresh DSH QR in the native app. For physical-device testing, configure debug signing and connect a HarmonyOS phone.' : 'Install official DevEco Studio / Command Line Tools, then run npm run build:hap.'
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/environment.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
