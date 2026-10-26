import { readFile, writeFile, copyFile, mkdir, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Build a separate bundle; production sources are restored even on compile failure.
const root = path.resolve(import.meta.dirname, '..');
const files = ['AppScope/app.json5', 'entry/src/main/resources/base/profile/main_pages.json', 'entry/src/main/ets/entryability/EntryAbility.ets'];
const original = await Promise.all(files.map(f => readFile(path.join(root, f), 'utf8')));
const page = path.join(root, 'entry/src/main/ets/pages/ExportSmoke.ets');
try {
  await writeFile(path.join(root, files[0]), original[0].replace('"com.szk.dshconnect"', '"com.szk.dshconnect.qa"'));
  const pages = JSON.parse(original[1]); pages.src.push('pages/ExportSmoke');
  await writeFile(path.join(root, files[1]), JSON.stringify(pages));
  await writeFile(path.join(root, files[2]), original[2].replace("loadContent('pages/Index'", "loadContent('pages/ExportSmoke'"));
  await copyFile(path.join(root, 'tools/qa-export/ExportSmoke.ets'), page);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/build.ps1'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('QA native compile failed');
  await mkdir(path.join(root, '.cache/qa-export'), { recursive: true });
  await copyFile(path.join(root, 'entry/build/default/outputs/default/entry-default-unsigned.hap'), path.join(root, '.cache/qa-export/export-qa.hap'));
} finally {
  for (let i = 0; i < files.length; i++) await writeFile(path.join(root, files[i]), original[i]);
  await unlink(page).catch(() => {});
}
