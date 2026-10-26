# 服务商与协议 · 0.6.0

在「独立 AI 聊天 → 模型设置 → 服务商」选择预设，填写自己的 API Key，再获取模型列表或手动填写 ID。预设包含公开地址与协议，不附带账户、额度或模型使用权。各服务商分别保留已保存的配置；切换默认服务只影响新对话。

| 服务商 | 默认聊天协议 | 模型目录 | 图像工作室 |
| --- | --- | --- | --- |
| 硅基流动 SiliconFlow | Chat Completions | GET /models，按场景过滤 | image_size / image，解析 images[] |
| Claude / Anthropic | Messages | GET /models，分页 | 未预设生图能力 |
| OpenAI / GPT | Responses，可切换 Chat Completions | GET /models | Images / JSON edits |
| DeepSeek | Chat Completions | GET /models | 未预设生图能力 |
| 火山方舟 / 豆包 | Chat Completions | 手动填写模型或 ep- ID | Seedream |
| OpenRouter | Chat Completions | GET /models；生图用 /images/models | POST /images，input_references |
| Google Gemini | 原生 streamGenerateContent | 原生 /models，过滤 generateContent，分页 | 原生 generateContent |
| 阿里云百炼 / 通义千问 | Chat Completions | 同 origin 的原生 /api/v1/models | 未预设 DashScope 原生生图 |
| 月之暗面 / Kimi | Chat Completions | GET /models | 未预设生图能力 |
| 智谱 / GLM | Chat Completions | 手动填写 | 未预设 CogView |
| MiniMax | Anthropic 兼容 Messages | 手动填写 | 未预设生图能力 |
| 自定义 / 中转服务 | 四种协议可选 | 按所选协议 GET /models | OpenAI 兼容 Images |

模型列表来自所选地址，只在点击获取后请求；可搜索并点选，也可返回手动填写。目录不等于该账户已开通所有模型。目录失败不会发起推理或自动尝试其他平台。分页最多 5 页、去重后最多 2000 项，截断会提示。模型 ID 不被静态“最新型号”覆盖。

## 地址与认证

- 基础地址包含 API 版本路径，例如 Anthropic `https://api.anthropic.com/v1`、Gemini `https://generativelanguage.googleapis.com/v1beta`。可自定义反向代理路径；模型名不决定请求域名。
- Anthropic 使用 `x-api-key` 与兼容版本 `anthropic-version: 2023-06-01`；Gemini 使用 `x-goog-api-key`；其他入口使用 Bearer Key。Gemini 的 `alt=sse` 是应用构造的功能参数，密钥不进 URL。
- 百炼默认北京按量入口，新工作空间、其他地域和套餐应使用控制台提供的对应域名。智谱、方舟等 Coding Plan 与按量服务也可能采用不同入口，请按对应套餐文档配置。Claude Code 是客户端；这里接 API Key 与 Messages 协议。
- 四种聊天协议分别构造请求与解析流事件；OpenRouter 的 reasoning 与其他兼容接口的 reasoning_content 都进入原生思考折叠区，不重复显示别名字段。各协议保留文本、思考/摘要、完成、中断与错误语义。截断上下文后从用户轮开始，相邻同角色消息合并，避免失败回复被过滤后形成非法轮次。Anthropic 固定最大输出 4096 token；目前未提供手机端本地工具执行或多轮 tool_use 回传。
- 密钥按 origin 存入 Asset Store。配置、目录和历史不包含密钥；模型请求不带 DSH Cookie，不跟随重定向。返回图像的下载使用独立无凭据请求。
- 保存配置不调用模型；发送文字、生成图片或图片问答时才提交内容。未自动开通、购买或部署服务。

## 图像格式

OpenRouter 使用当前官方独立 Images API，而非假设它等同于 `/images/generations`；参考图为 `input_references[].image_url.url`。解析器同时可读兼容响应中的 `choices[].message.images`。硅基流动尺寸为 `image_size`，参考图为 `image`，返回图片常在 `images[]`；下载后立即缓存，避免临时 URL 到期。

图像服务各自保存配置。选择生图模型与视觉模型是两项独立操作；通用模型目录缺少模态信息时不会冒称支持图片。原有 0.5 历史及配置无需手工转换。

## 参考与验证边界

架构参考 [Cherry Studio 服务商解析说明](https://github.com/CherryHQ/cherry-studio/blob/main/docs/references/ai/provider-resolution.md)：服务商身份、端点与适配器分离。Cherry Studio 为 AGPL；本项目独立实现 ArkTS 适配，没有引入其实现代码或 AI SDK。

接口依据（2026-10-25 查阅）：[OpenAI Responses](https://developers.openai.com/api/docs/guides/text)、[Claude 流事件](https://platform.claude.com/docs/en/build-with-claude/streaming)、[Gemini API](https://ai.google.dev/api/generate-content)、[硅基流动图像接口](https://api-docs.siliconflow.cn/docs/api/images-generations-post)、[OpenRouter Images](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)、[DeepSeek](https://api-docs.deepseek.com/)、[百炼地址](https://help.aliyun.com/en/model-studio/base-url)、[智谱对话](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)、[MiniMax Anthropic 入口](https://platform.minimax.cn/docs/api-reference/text-anthropic-api)。服务商目录与功能会变化，运行时获取为准。

验证采用本机隔离 HTTP 服务、虚拟密钥和程序生成测试图片，覆盖请求结构、认证头、模型选择、流式/取消、缓存与旧配置迁移。没有调用用户的付费模型；实际公网连通性、账户权限与各具体型号的能力仍需使用者配置后验收。
