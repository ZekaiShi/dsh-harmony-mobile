import test from 'node:test';
import assert from 'node:assert/strict';
import { ResponsiveLayout } from '../.cache/core/ResponsiveLayout.mjs';

test('fold cover, near-square, wide and split-window metrics never overflow their usable width',()=>{
 for(const width of [280,320,346,430,600,664,699,700,707,773,840,939,960,1107,1440])for(const height of [240,360,480,640,800,1100]){
  const m=ResponsiveLayout.measure(width,height);
  assert.ok(m.chat+m.sidebar<=width+0.01);assert.ok(m.form<=width);assert.ok(m.dashboard<=width);
  assert.ok(m.homeColumns*m.card+(m.homeColumns-1)*16+2*m.gutter<=m.dashboard+0.01);
  assert.equal(m.compact,height<520);assert.equal(m.tight,height<300);if(m.sidebar)assert.ok(width-m.sidebar>=440);
 }
});
test('breakpoints react only to window geometry, retaining a readable minimum chat pane',()=>{
 assert.equal(ResponsiveLayout.measure(346,780).sidebar,0);
 assert.equal(ResponsiveLayout.measure(707,700).sidebar,240);
 assert.equal(ResponsiveLayout.measure(1107,700).sidebar,280);
 assert.equal(ResponsiveLayout.measure(939,600).homeColumns,2);
 assert.equal(ResponsiveLayout.measure(1107,700).homeColumns,3);
 assert.equal(ResponsiveLayout.measure(1107,240).sidebar,280,'Keyboard height does not discard the sidebar or change chat identity');
});
test('image grid divides available space without clipped columns at each transition',()=>{
 for(const width of [220,320,559,560,720,959,960,1112]){
  const columns=ResponsiveLayout.galleryColumns(width),card=ResponsiveLayout.imageCard(width);
  assert.ok(Math.abs(columns*card+(columns-1)*16-width)<0.01);assert.ok(card>200);
 }
});
