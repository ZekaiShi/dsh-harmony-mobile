# 原生客户端协议约定

2026-10-24 用户明确要求会话列表、消息和输入框改为 ArkUI。0.2 使用原生 HTTP/SSE，覆盖首版整页 ArkWeb 方案。上游验收固定提交为 `67df6719fb1895139cd1ac595b2367b5642be67c`，应用实际连接用户电脑当前版本。

## 配对与认证

- 二维码仍为 `http(s)://host[:port]/pair?token=<base64url>`，不转换、不签发新 token。
- 0.8.6 起公网地址必须 HTTPS；HTTP 只允许 localhost、回环/私有/链路本地 IP（含 IPv6 ULA/链路本地），拒绝公网明文和任意 HTTP 域名。上游现有 LAN IP 二维码与 HTTPS 隧道仍兼容。LAN HTTP 本身不提供传输加密。
- LAN 配对返回 `dsh_mobile` Cookie 和同 origin 跳转；互联网配对进入原生 PIN 页，再向 `/pair/verify` POST `{pin}`。
- 原生请求使用真实目标 origin，不篡改 Host、Origin 或 Fetch Metadata 来绕过验证。
- HTTP `maxRedirects=0`，逐个验证重定向。跨 origin 的迁移返回 UI 确认后才重新连接；旧 origin 凭据不转发。
- Cookie 仅发给相同规范化 origin，使用 Asset Store 应用私有加密存储，首次解锁后可访问。二维码 token、PIN 不持久化，最近记录只有 origin/标签/时间。
- 首版 ArkWeb Cookie 不自动迁移；升级原生版后需重新配对。移除最近记录同时移除该 origin 的原生凭据。
- 证书验证保持系统默认，不跳过验证、不安装自签 CA。

## RPC 与流式消息

向 `/api/rpc` POST `{method,payload}`，解析 `{ok,value,error}`：

| 移动端方法 | 原生用途 |
| --- | --- |
| workspace.list / session.list | 工作区与会话列表 |
| session.create | 新建会话 |
| session.history | 读取最近历史与状态 |
| session.prompt | 发送文本，mode=steer，携带设备时区 |
| session.cancel | 停止当前回复 |
| interaction.pending / interaction.answer / interaction.cancel | 用户问答 |

`/api/session/stream?sessionId=...` 保持 Cookie 认证，解析 SSE snapshot/event。平台层使用流式 UTF-8 解码，核心解析器支持拆分 CRLF、多行 data 和注释，限制单帧缓冲大小。snapshot 替换历史，event 按 seq 去重；历史请求与 SSE 使用 revision/会话 epoch 防止旧响应覆盖新状态。

原生投影处理 user/message、assistant/chunk、assistant/message、tool/call、tool/result 和 turn/start/end。耐久消息替换增量文本，防止重复回复。UI 使用消息版本驱动 ArkUI ForEach，保证流式文本和会话标题实际刷新。

断流指数退避重连；SSE 不在线时加快历史轮询，在线时降低轮询频率。退到会话列表或后台会关闭订阅与定时器。桌面撤销配对时，401 转为原生错误，不伪造本地已连接状态。

## 测试与限制

核心 Node 测试使用同一份客户端/投影/解析代码，平台网络接口由 Node 适配器替代；模拟器测试使用真正的 NativeHttp、Asset Store 和 ArkUI。隔离 Host 模拟回复，原始上游移动桥保持不变。PIN 的核心协议测试模拟隧道请求头，不等同真实公网 TLS 隧道验收。

最低 API 23 用于原生 HTTP 重定向控制；目标和已验证模拟器为 API 26。消息使用原生 Markdown 子集；附件、公式、HTML、DSH 模型/预设选择与任务投影 UI 尚未移植。没有修改桌面协议或访问用户真实会话进行自动发信。

## 0.4 独立聊天

独立聊天使用单独的 `Assistant` 原生页面，不依赖 DSH 服务。`AssistantCore` 校验服务地址并组装请求；`ModelHttp` 使用官方 Remote Communication Kit POST 流式请求；`AssistantStore` 负责本机文件及独立的 Asset Store 密钥命名空间。

- 接口为用户指定基础路径下的 `/chat/completions`，也接受完整接口路径。JSON 请求含 `model`、`messages`、`stream:true`，认证为 `Authorization: Bearer ...`。没有 DSH Cookie 或伪造的 Origin。
- 只接受 HTTPS 或本机/局域网 HTTP；禁止 URL 用户名、密码、查询参数与片段。TLS 使用系统校验，RCP `autoRedirect:false`，遇到跳转返回错误，要求用户填写最终地址。未配置 Cookie 仓库，禁用缓存和详细网络日志。
- 解析 `choices[0].delta.content`、可选 `reasoning_content`、`finish_reason` 和 `[DONE]`；兼容一次性 `choices[0].message` JSON。没有结束标记的 SSE EOF 显示中断并保留部分文本。停止/切换页面使用 RCP `session.cancel(request)` 取消请求并释放会话，epoch 忽略迟到事件；不把 http.destroy 当作取消保证。供应商的实际推理和计费停止时机由服务端决定。
- 最近最多 40 条有效消息与系统指令进入上下文；思考内容、失败或中断的助手文本不作为后续模型上下文。当前不执行模型工具调用。
- 每个会话快照保留自己的服务地址、模型 ID 和系统指令；更改默认配置不改变已有会话。发送时按该 origin 查询密钥，不跨 origin 复用密钥。
- API Key 存于独立 Asset Store alias `dsh.assistant.api.<origin>`，与 DSH Cookie 分开。配置、消息和草稿只保存于 `filesDir/assistant-v1.json`，使用临时文件、fsync、rename 写入；不含密钥。读取失败时保留原文件且禁止覆盖。
- 上限为 100 个会话、每会话约 400 条消息、私有文件 16 MiB、单次原始回复约 419 万个 UTF-16 代码单元；超限提示用户整理或另建对话。重启时把未完成的 streaming 状态恢复为 interrupted。
- 模型自检通过本地隔离接口验证请求、流式事件、取消与错误，不调用真实付费模型。核心测试还覆盖非流式 JSON 和意外 EOF；模拟器直接使用真实的 RCP、Asset Store 和 ArkUI。

文字聊天的接口范围不等于兼容所有模型服务；Anthropic Messages、Responses、语音和手机本地推理尚未实现。图像在 0.5 通过单独原生页面接入。

## 0.5 图像工作室

`MediaCore` 维护五类图像服务格式、配置和记录；`MediaClient` 复用可取消的 RCP 传输，Gemini 改用 `x-goog-api-key`，其他接口使用 Bearer。`MediaFiles` 负责系统选择器、ImageKit 校验、私有图片和 JSON 元数据。

| 类型 | 图像生成与参考图 | 图片问答 |
| --- | --- | --- |
| OpenAI 兼容 | `/images/generations`，参考图用 JSON `/images/edits` 的 `images[].image_url` | Chat Completions `content` 数组中的 text 与 image_url |
| 火山方舟/Seedream | `/images/generations`，参考图为 `image`，保留 `watermark:true` | 同服务的 Chat Completions 视觉模型，需另填模型 ID |
| Gemini Developer API | `/models/<model>:generateContent`，`contents[].parts`，图像通过 inlineData；生成时指定 TEXT/IMAGE 输出 | 同一原生端点，视觉模型及文字/图片 parts，不请求图像输出 |

- 解析兼容接口的 `data[].b64_json/url`，Gemini 的 `candidates[0].content.parts[].text/inlineData`，忽略 thought 部分。服务不返回图像时明确提示，不把文字伪装为生成成功。
- 不硬编码可用模型，不默认发送 GPT Image 不支持的 `response_format`；尺寸、质量、返回格式由用户按模型能力选填。兼容接口参考图编辑目前仅适配 JSON，未实现旧 multipart 编辑上传。
- 模型服务与图片下载均不跟随重定向、禁用缓存和详细网络日志，证书保持系统校验。图片链接仅在接收期间使用，不写入历史，CDN 下载不附带 Authorization、Google Key 或 DSH Cookie。
- 参考图通过系统 PhotoViewPicker 或 DocumentViewPicker 获得访问权。最长边缩至 2048 像素后重新编码为 JPEG；生成图保持服务返回的 PNG/JPEG/WebP。保存前验证实际文件签名、ImageKit 解码与像素上限。
- 私有目录 `filesDir/media` 存储随机文件名图片及 `index.json`；索引使用临时文件、fsync、rename。索引读取失败时保留原文件并阻止覆盖。中断任务恢复为 interrupted，不自动重发或自动消费模型费用。
- 图片通过系统 DocumentViewPicker 选定位置后导出；不申请整个相册或文件系统的读写权限。删除记录只回收未被其他记录和草稿引用的图片。
- 当前为非流式图像任务，单次最多处理 4 张、单张 8 MiB / 4000 万像素，缓存总量 256 MiB、记录上限 100；图像工作室的任务没有隐式多轮模型上下文。

协议来源：[OpenAI Images 生成](https://developers.openai.com/api/reference/resources/images/methods/generate)、[JSON 图像编辑](https://developers.openai.com/api/reference/resources/images/methods/edit)、[视觉输入](https://developers.openai.com/api/docs/guides/images-vision)、[火山方舟图像接口](https://docs.volcengine.com/docs/ark/image-generation-api?lang=en)、[Gemini 图像生成](https://ai.google.dev/gemini-api/docs/generate-content/image-generation?hl=en)。兼容性测试使用隔离服务器及程序生成的测试 PNG，不能证明真实供应商账号权限或模型效果。


## 0.6 服务商适配

服务商身份与聊天协议分开保存，已有 0.5 配置缺省迁移为 custom / chat。会话中保存服务和模型快照；默认配置另存每个服务商的最近已保存配置。四类聊天协议的路径、认证、请求和流式事件由各自适配器处理；详见 [PROVIDERS.md](PROVIDERS.md)。

模型目录使用同一 RCP 安全传输的 GET 分支，只有用户点击获取才请求。服务端分页只提取并编码 cursor，不接受服务端提供的任意 next URL；最多五页、2000 模型。停止、返回与切换页面关闭目录请求，异步密钥读取使用代次检查，不能覆盖新选择。

图像增加 SiliconFlow 的 image_size / images[] 和 OpenRouter 独立 /images、input_references、/images/models；图片下载仍不附带任何模型认证头。原有接口、文件缓存与 DSH 协议保持兼容。
