# 独立聊天 · 上下文、思考与附件（0.8）

本轮入口为主页「独立 AI 聊天」。DSH 模式仍使用电脑现有协议，不把独立模型的参数冒充电脑能力。

- 输入框左侧是独立圆形加号，发送/停止留在输入框内。加号弹出原生两项菜单，仅显示图片/文件与相应 SVG 图标，打开系统相册或文件选择器。
- 输入框底部仅显示小圆环与百分比；未知窗口显示「—」。点击查看估算说明并设置当前会话的窗口大小。目录可提供 OpenRouter context_length / Gemini inputTokenLimit，手动模型可自行填写。数字统计实际最近 40 条有效消息、系统指令与当前草稿，不累计历史计费 token。
- 百分比为估算：文字按宽窄字符估算，图片按固定预算，PDF 按文件大小估算；并非 tokenizer 或服务端精确 usage。窗口设置只影响显示，不改变服务端容量。超过窗口时圆环最多显示 100%，详情仍显示估算 token 数。
- 思考等级只显示已接入的参数。默认不发送任何覆盖参数；OpenAI 的 Chat / Responses 使用各自的 reasoning_effort / reasoning.effort，OpenRouter 优先读取目录的 supported_efforts，Claude 区分 adaptive effort 与旧式 budget_tokens，Gemini 2.5 使用 thinkingBudget，DeepSeek flash/pro 使用当前原生参数。未知或别名模型只保留默认，不承诺任意中转都接受这些参数。
- 模型目录可横向筛选全部、文本、推理、视觉、多模态、生图、语音合成、音频理解、嵌入、未标注。分类优先依据服务商结构化元数据，缺失时使用明确标注「名称推断」的有限规则。语音/嵌入标签不代表已实现对应调用；非文字输出模型不从聊天入口发送，图像入口仍在「图像工作室」。

## 附件边界

每条消息最多 4 个附件；支持图片、UTF-8 文本/代码及 PDF。相册和文件中的图片经本机 ImageKit 解码，最长边缩至 2048 并转 JPEG。文本文件最大 256 KiB，PDF 最大 4 MiB，单张处理后图片最大 8 MiB；整次请求上下文附件载荷限制 16 MiB。当前不解析 Word、Excel、压缩包或音频，不以文件名冒充读取结果。

文本内容作为带文件名的正文交给模型；图片分别适配 Chat Completions image_url、Responses input_image、Anthropic image/base64、Gemini inlineData；PDF 使用 Responses input_file、Anthropic document/base64、Gemini inlineData。普通 Chat Completions 入口暂不发送 PDF，并明确提示切换原生协议。协议支持不代表每个模型都支持视觉或 PDF，仍以服务商权限和模型为准。

附件选择后保存在应用私有 chat-files / chat-images，独立于图像工作室 media 缓存，避免图像历史清理误删聊天附件。会话文件只保存受校验的相对路径和元数据；Base64 仅在发送时读取并构建请求。草稿附件、已发附件随本机会话保留；删除附件/会话后只清理未被其他会话引用的缓存。点击发送才上传，后续提问会重新发送最近上下文关联的附件。不额外声称端到端加密。

## 接口依据

- [OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenRouter reasoning tokens / model-supported efforts](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [Claude thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Claude PDF](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- [Gemini GenerateContent 配置](https://ai.google.dev/api/generate-content)
- [Gemini PDF](https://ai.google.dev/gemini-api/docs/document-processing)
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)

仅使用隔离接口与虚拟密钥测试，不自动调用用户的付费服务。真机、真实服务商权限与计费行为未验收。
