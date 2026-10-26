import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { LengthMetricsUnit, window } from '@kit.ArkUI';
import { ConversationFiles } from '../platform/ConversationFiles';
import { ExportDocument, ExportMessage } from '../core/ConversationExport';
import { AssistantCore, AssistantData, LocalMessage, ModelProfile } from '../core/AssistantCore';
import { AssistantStore } from '../platform/AssistantStore';
import { MediaData, MediaProfile, MediaRecord } from '../core/MediaCore';
import { MediaFiles } from '../platform/MediaFiles';

@Entry
@Component
struct ExportSmoke {
  @State result: string = '仅包含虚构测试资料';
  @State safeTop: number = 0;
  @State qaBase: string = '';
  aboutToAppear(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    window.getLastWindow(context).then((current: window.Window) => { this.safeTop = current.getWindowProperties().windowRect.top + current.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM).topRect.height; });
  }
  private async seedMenus(): Promise<void> {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const store = new AssistantStore(); store.load(context);
    const data = new AssistantData(), profile = new ModelProfile();
    profile.base = 'https://example.invalid/v1'; profile.model = 'qa-offline'; data.profile = profile;
    if (/^http:\/\/10\.0\.2\.2:\d{1,5}\/v1$/.test(this.qaBase)) {
      profile.base = this.qaBase; profile.model = 'qa-model'; await store.saveKey(AssistantCore.endpoint(profile.base).origin, 'qa-not-a-real-model-key');
    }
    const conversation = AssistantCore.create('qa-menu', profile, Date.now()); conversation.title = '菜单隔离验收'; conversation.titleSource = 'manual'; conversation.titleState = 'done';
    const user = new LocalMessage(); user.id = 'qa-user'; user.text = '仅用于菜单验收。';
    const reply = new LocalMessage(); reply.id = 'qa-reply'; reply.role = 'assistant'; reply.text = '这是一条虚构回复，没有模型请求。';
    reply.text += '\n\n## 折叠屏排版\n\n| 对象 | 结果 | 说明 |\n| --- | --- | --- |\n| 长路径文件引用 | 正常 | profiles/web/node_modules/very-long-package-name/package.json |\n\n```typescript\nconst value = "仅供原生窗口比例测试";\n```';
    const second = AssistantCore.create('qa-second', profile, Date.now()); second.title = '另一条隔离会话'; second.titleSource = 'manual'; second.titleState = 'done'; second.messages = [user, reply];
    conversation.messages = [user, reply]; data.conversations = [conversation, second]; store.save(data);
    const files = new MediaFiles(); files.load(context);
    const media = new MediaData(), record = new MediaRecord(), mediaProfile = new MediaProfile();
    mediaProfile.base = 'https://example.invalid/v1'; mediaProfile.model = 'qa-image'; record.profile = mediaProfile;
    record.id = 'qa-menu'; record.createdAt = Date.now(); record.status = 'done'; record.prompt = '虚构图像问答'; record.text = '仅用于菜单验收的文字，不请求服务。';
    for (let index = 0; index < 3; index++) {
      const width = index === 1 ? 160 : 320, height = index === 1 ? 240 : index === 2 ? 120 : 200;
      const canvas = new OffscreenCanvas(width, height, LengthMetricsUnit.PX), drawing = canvas.getContext('2d');
      drawing.fillStyle = index === 0 ? '#dce7f1' : index === 1 ? '#e8dfd1' : '#dce8d7'; drawing.fillRect(0, 0, width, height);
      drawing.fillStyle = '#30302e'; drawing.font = '18px sans-serif'; drawing.fillText('QA 图片 ' + (index + 1), 12, 40);
      const pixels = drawing.getPixelMap(0, 0, width, height), packer = image.createImagePacker(), name = 'qa-fold-' + index + '.png';
      const output = fileIo.openSync(context.filesDir + '/media/' + name, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try { await packer.packToFile(pixels, output.fd, { format: 'image/png', quality: 100 }); }
      finally { fileIo.closeSync(output); await pixels.release(); await packer.release(); canvas.width = 0; canvas.height = 0; }
      record.images.push({ file: name, mime: 'image/png', width: width, height: height });
    }
    media.history = [record]; files.save(media); this.result = '菜单测试数据已准备';
  }
  private async generate(): Promise<void> {
    this.result = '正在生成';
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const destination = context.filesDir + '/qa-export';
    try {
      if (!fileIo.accessSync(destination)) fileIo.mkdirSync(destination);
      const media = context.filesDir + '/media';
      if (!fileIo.accessSync(media)) fileIo.mkdirSync(media);
      const canvas = new OffscreenCanvas(640, 320, LengthMetricsUnit.PX), drawing = canvas.getContext('2d');
      drawing.fillStyle = '#dce7f1'; drawing.fillRect(0, 0, 640, 320);
      drawing.fillStyle = '#30302e'; drawing.font = '32px sans-serif'; drawing.fillText('虚构图片 · 中文渲染验收', 36, 120);
      const pixels = drawing.getPixelMap(0, 0, 640, 320), packer = image.createImagePacker();
      const picture = fileIo.openSync(media + '/qa-image.png', fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try { await packer.packToFile(pixels, picture.fd, { format: 'image/png', quality: 100 }); }
      finally { fileIo.closeSync(picture); await pixels.release(); await packer.release(); canvas.width = 0; canvas.height = 0; }
      const doc = new ExportDocument(); doc.title = '中文长对话导出验收'; doc.source = '独立隔离测试'; doc.model = 'synthetic-no-network';
      const question = new ExportMessage(); question.role = 'user'; question.text = '请检查中文、表格、代码和图片的连续排版。';
      const reply = new ExportMessage(); reply.role = 'assistant';
      reply.text = '## 测试结果\n\n这是虚构内容，不包含任何真实会话、密钥和服务地址。\n\n| 步骤 | 对象 | 结果 |\n| --- | --- | --- |\n';
      for (let index = 1; index <= 110; index++) reply.text += '| P' + index + ' 验证 | profiles/web/node_modules/long-package-name/file-' + index + '.json | 中文内容完整，表格行高紧凑 |\n';
      reply.text += '\n```typescript\nconst result = "中文与 English 123";\n// 长路径应换行，不能超出页面边界\nprofiles/web/node_modules/example/package.json\n```\n\n最后一段：导出结束标记 FINAL-CONTENT。';
      reply.images = [{ file: 'qa-image.png', namespace: 'media', width: 640, height: 320 }];
      doc.messages = [question, reply];
      const names: string[] = [];
      for (const format of ['md', 'png', 'pdf']) {
        const prepared = await ConversationFiles.prepare(context, doc, format);
        try {
          for (let index = 0; index < prepared.files.length; index++) {
            const name = format === 'png' ? 'long-' + index + '.png' : 'conversation.' + format;
            fileIo.copyFileSync(prepared.files[index], destination + '/' + name); names.push(name);
          }
        } finally { ConversationFiles.dispose(context, prepared); }
      }
      const report = fileIo.openSync(destination + '/result.json', fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try { const bytes = new util.TextEncoder().encodeInto(JSON.stringify(names)); fileIo.writeSync(report.fd, bytes.buffer as ArrayBuffer); } finally { fileIo.closeSync(report); }
      this.result = '成功：' + names.join(', ');
    } catch (error) { this.result = '失败：' + (error as Error).message; }
  }
  build() {
    Column({ space: 24 }) {
      Text('DSH 导出隔离验收').fontSize(24)
      Text(this.result).id('qa-result')
      Text('安全区像素：' + this.safeTop).id('qa-safe-top')
      TextInput({ text: this.qaBase, placeholder: '可选：模拟器虚构服务' }).height(44).id('qa-model-base').onChange((value: string) => { this.qaBase = value; })
      Button('生成虚构导出').id('qa-generate').onClick(() => { void this.generate(); })
      Button('准备菜单测试数据').id('qa-seed-menu').onClick(() => { void this.seedMenus(); })
      Button('打开主页').id('qa-home').onClick(() => { this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' }); })
    }.width('100%').height('100%').justifyContent(FlexAlign.Center).padding(24).backgroundColor('#faf9f5')
  }
}

