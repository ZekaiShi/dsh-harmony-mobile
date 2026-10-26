export class ProviderPreset {
  constructor(public id: string, public name: string, public base: string, public protocol: string,
    public media: string = '', public discovery: boolean = true, public note: string = '') {}
}

// Provider identity and wire protocol are independent. These are public API endpoints,
// not a bundled model entitlement. Model IDs are discovered from the user's account.
export class ProviderCatalog {
  static all(): ProviderPreset[] {
    return [
      new ProviderPreset('silicon', '硅基流动 SiliconFlow', 'https://api.siliconflow.cn/v1', 'chat', 'silicon'),
      new ProviderPreset('anthropic', 'Claude / Anthropic', 'https://api.anthropic.com/v1', 'anthropic', '', true, '使用 Anthropic API Key；Claude Code 是客户端，不是独立 API 服务。'),
      new ProviderPreset('openai', 'OpenAI / GPT', 'https://api.openai.com/v1', 'responses', 'compatible'),
      new ProviderPreset('deepseek', 'DeepSeek', 'https://api.deepseek.com', 'chat'),
      new ProviderPreset('ark', '火山方舟 / 豆包', 'https://ark.cn-beijing.volces.com/api/v3', 'chat', 'ark', false, '填写控制台的模型 ID 或 ep- 接入点 ID；不自动开通或部署模型。'),
      new ProviderPreset('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'chat', 'openrouter'),
      new ProviderPreset('gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini', 'gemini'),
      new ProviderPreset('qwen', '阿里云百炼 / 通义千问', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'chat', '', true, '北京按量 API 入口；新工作空间请改为控制台提供的专属域名，其他地域与套餐使用各自地址。'),
      new ProviderPreset('moonshot', '月之暗面 / Kimi', 'https://api.moonshot.cn/v1', 'chat'),
      new ProviderPreset('zhipu', '智谱 / GLM', 'https://open.bigmodel.cn/api/paas/v4', 'chat', '', false, '可手动填写模型 ID。Coding Plan 与按量 API 使用不同地址，请按套餐文档修改。'),
      new ProviderPreset('minimax', 'MiniMax', 'https://api.minimax.cn/anthropic/v1', 'anthropic', '', false, '预设为中国区 Anthropic 兼容入口；可切换 Chat Completions 并修改基础地址。'),
      new ProviderPreset('custom', '自定义 / 中转服务', '', 'chat', 'compatible', true, '选择中转服务实际支持的协议；不会按模型名称猜测或切换密钥发送地址。')
    ];
  }
  static get(id: string): ProviderPreset { return this.all().find((item: ProviderPreset) => item.id === id) || this.all()[11]; }
  static protocols(): string[] { return ['chat', 'responses', 'anthropic', 'gemini']; }
  static protocolLabel(id: string): string { return id === 'responses' ? 'Responses' : id === 'anthropic' ? 'Anthropic Messages' : id === 'gemini' ? 'Gemini 原生' : 'Chat Completions'; }
}
