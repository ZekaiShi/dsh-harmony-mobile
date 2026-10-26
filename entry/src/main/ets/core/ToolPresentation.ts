interface ToolArguments {
  cmd?: string; command?: string; path?: string; file_path?: string; filename?: string;
  url?: string; query?: string; input?: string; patch?: string; pattern?: string;
}
export class ToolActivity {
  category: string = 'tool';
  summary: string = '';
}
export class ToolPresentation {
  static parseArguments(input?: Object): Object | undefined {
    if (typeof input !== 'string') return input;
    if (input.length > 131072) return undefined;
    try { const parsed = JSON.parse(input) as Object; return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined; } catch (_) { return undefined; }
  }
  private static string(value: string | undefined): string { return typeof value === 'string' ? value : ''; }
  private static compact(text: string): string { return text.replace(/([?&](?:token|api_key|key)=)[^\s&#]+/gi, '$1…').replace(/\s+/g, ' ').trim().slice(0, 240); }
  private static filename(path: string): string { return path.replace(/\\/g, '/').split('/').filter((part: string) => part.length > 0).pop() || ''; }
  static describe(name: string, input?: Object): ToolActivity {
    const activity = new ToolActivity(); const lower = name.toLowerCase(); const args = (this.parseArguments(input) || {}) as ToolArguments;
    const path = this.string(args.file_path) || this.string(args.path) || this.string(args.filename);
    const command = this.string(args.cmd) || this.string(args.command);
    if (/github|gitlab/.test(lower)) {
      activity.category = 'github';
      activity.summary = /search/.test(lower) ? '搜索仓库内容' : /fetch_file|fetch_blob/.test(lower) ? '读取文件' : /pull|_pr_/.test(lower) ? '查看拉取请求' : /issue/.test(lower) ? '查看议题' : '读取仓库信息';
      if (/gitlab/.test(lower)) activity.category = 'web';
    } else if (/apply_patch|edit_file|write_file|str_replace|multi.?edit|patch_file|(^|[_.:])edit$/.test(lower)) {
      activity.category = 'edit';
      const patch = this.string(args.input) || this.string(args.patch);
      const files = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/gm)].map((match: RegExpMatchArray) => match[1]);
      activity.summary = path ? this.filename(path) : files.length ? this.filename(files[0]) + (files.length > 1 ? ' 等 ' + files.length + ' 个文件' : '') : name;
    } else if (/view_image|open_image|read_image|image_query|image_search/.test(lower)) {
      activity.category = 'image'; activity.summary = this.filename(path) || this.string(args.query);
    } else if (/imagegen|image_gen|generate_image/.test(lower)) {
      activity.category = 'image-create'; activity.summary = '';
    } else if (/exec_command|write_stdin|(^|[_.:])(pwsh|powershell|shell|bash|terminal|run_command|exec)$/.test(lower)) {
      activity.category = 'terminal'; activity.summary = command || (/write_stdin/.test(lower) ? '终端输出' : name);
    } else if (/read_file|read_text|file_read|open_file|(^|[_.:])read$/.test(lower)) {
      activity.category = 'read'; activity.summary = this.filename(path) || name;
    } else if (/search|grep|find_file|list_file/.test(lower)) {
      activity.category = 'search'; activity.summary = this.string(args.query) || this.string(args.pattern) || path || name;
    } else if (/spawn_agent|send_message_to_agent|wait_agent|subagent|(^|[_.:])(agent|task|delegate)([_.:]|$)/.test(lower)) {
      activity.category = 'agent'; activity.summary = name;
    } else if (/web|browse|fetch|http/.test(lower)) {
      activity.category = 'web'; activity.summary = this.string(args.url) || this.string(args.query) || name;
    } else activity.summary = name;
    activity.summary = this.compact(activity.summary); return activity;
  }
  static label(category: string, status: string): string {
    if (status === 'ended') return '已结束';
    const active = status === 'running'; const failed = status === 'error';
    if (category === 'terminal') return failed ? '运行失败' : active ? '正在运行' : '已运行';
    if (category === 'edit') return failed ? '编辑失败' : active ? '正在编辑' : '已编辑';
    if (category === 'image') return failed ? '查看失败' : active ? '正在查看图片' : '已查看图片';
    if (category === 'image-create') return failed ? '生成失败' : active ? '正在生成图片' : '已生成图片';
    if (category === 'github') return failed ? 'GitHub 调用失败' : active ? '正在使用 GitHub' : '已使用 GitHub';
    if (category === 'read') return failed ? '读取失败' : active ? '正在读取' : '已读取';
    if (category === 'search') return failed ? '搜索失败' : active ? '正在搜索' : '已搜索';
    if (category === 'web') return failed ? '访问失败' : active ? '正在访问' : '已访问';
    if (category === 'agent') return failed ? 'Agent 调用失败' : active ? '正在调用 Agent' : '已调用 Agent';
    return failed ? '调用失败' : active ? '正在调用' : '已调用';
  }
}
