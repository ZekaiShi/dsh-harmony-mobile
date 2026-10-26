import { mkdir, writeFile } from 'node:fs/promises';
const base = new URL('../entry/src/main/resources/', import.meta.url);
// Generic UI icons use official sys.symbol resources in ArkUI. Only the
// separate GitHub brand outline is stored as SVG (Feather MIT attribution).
const github = '<path d="M9 20c-5 1.5-5-2.5-7-3m14 5v-4a3.5 3.5 0 0 0-1-2.8c3.3-.4 6.8-1.6 6.8-7.3a5.7 5.7 0 0 0-1.6-4A5.3 5.3 0 0 0 20 0s-1.3-.4-4.2 1.6a14.4 14.4 0 0 0-7.6 0C5.3-.4 4 0 4 0a5.3 5.3 0 0 0-.2 3.9 5.7 5.7 0 0 0-1.6 4c0 5.7 3.5 6.9 6.8 7.3A3.5 3.5 0 0 0 8 18v4" transform="translate(1 1) scale(.9)"/>';
const palettes = {
  base: { start_window_background:'#FAF9F5',page_bg:'#FAF9F5',surface:'#FFFFFF',text_primary:'#30302E',text_secondary:'#817F78',accent:'#C16A4A',accent_soft:'#EEECE5',danger:'#B34A36',line:'#DFDDD5',code_bg:'#F0EFEA',ink:'#30302E',on_ink:'#FFFFFF',link:'#4667D8' },
  dark: { start_window_background:'#252523',page_bg:'#252523',surface:'#30302E',text_primary:'#ECEBE6',text_secondary:'#A5A49C',accent:'#DF9876',accent_soft:'#393934',danger:'#F2A18F',line:'#4A4942',code_bg:'#1D1D1B',ink:'#E9E8E2',on_ink:'#252523',link:'#91AAFF' }
};
for (const [theme, colors] of Object.entries(palettes)) {
  await mkdir(new URL(`${theme}/media/`,base),{recursive:true});
  await writeFile(new URL(`${theme}/element/color.json`,base), JSON.stringify({color:Object.entries(colors).map(([name,value])=>({name,value}))},null,2)+'\n');
  await writeFile(new URL(`${theme}/media/ic_github.svg`,base), `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${colors.text_primary}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${github}</svg>\n`);
}
