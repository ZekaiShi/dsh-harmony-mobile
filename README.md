# dsh-harmony-mobile

面向 HarmonyOS 的社区原生 AI 客户端，使用 ArkUI。手机可直接连接用户配置的模型 API，也可连接电脑上的 DSH Desktop，继续电脑端会话与任务。

本项目独立维护，不是 DeepSeek、Dataelem 或华为的官方客户端。

## 0.9.1 开发预览

从已经验证的 0.8.6 原生客户端建立，包含：

- 独立聊天、流式回复、本地历史与草稿、原生图片/文件选择、Markdown 阅读。
- 四类聊天协议：Chat Completions、Responses、Anthropic Messages、Gemini。
- 图像工作室：兼容 Images、Seedream、Gemini、SiliconFlow、OpenRouter 的相应接口。
- DSH Desktop 的现有二维码、六位 PIN、Cookie、RPC 与 SSE 连接。
- HarmonyOS 系统符号、原生导航、设备支持时的沉浸光感按钮和前台握姿适配。

新增回复/会话复制，长图 PNG、Markdown 与分页 PDF 导出；独立聊天记录服务端 Token 用量（未返回时标明估算），默认在首次完整回复后自动生成一次标题。自动命名会额外请求当前模型，可能计费，可在设置关闭；旧会话和手动标题不会自动覆盖。重新生成、命名和已中断请求分别计入用量。DSH 电脑会话当前仅显示已加载正文的估算，不能当作账单。

长图/PDF 包含本机图片，Markdown 保留正文格式并列出附件名称，不内嵌图片或附件字节。PDF 是分页图文版，文字不可搜索选择；长图过长会分段。导出不包含系统指令、隐藏思考、工具内部参数、API 密钥或草稿。电脑历史未完整返回时会明确标注。

电脑端插件位于 [packages/desktop-sender](packages/desktop-sender)，只增加 `/harmony-send` 文字发送命令，复用 DSH Desktop 的现有配对和会话通道。手机软件与插件独立维护，无需安装另一套手机网页。插件尚未收录市场。

0.9.1 统一了三个导出菜单，并将连续思考/工具/Agent 调用默认收起；系统负责避让状态栏，系统栏保持页面底色。新增验证见 [docs/VALIDATION_0.9.1.md](docs/VALIDATION_0.9.1.md)，此前导出/命名验证见 [docs/VALIDATION_0.9.0.md](docs/VALIDATION_0.9.0.md)，市场申请位置及要求见 [docs/MARKET_SUBMISSION.md](docs/MARKET_SUBMISSION.md)。有限回归不能代表所有服务商、设备或公网隧道都已实测。

## 开发

需要 Node.js 22+ 和官方 DevEco Studio / HarmonyOS SDK。当前工程配置面向 API 26；较早系统尚未验证。

```sh
npm ci
npm run upstream:prepare
npm run check
```

用 DevEco Studio 打开本目录，配置本机 SDK 后编译。命令行构建可设置 `OHOS_CLT` 指向已安装的官方 Command Line Tools，再运行 `npm run build:hap`。签名材料由开发者自行配置，不随仓库提供。

## 安全与数据

API Key 和电脑会话凭据分别保存在 Asset Store，并按 origin 隔离。对话、附件和草稿在应用沙箱中；没有自建模型转发服务或内置 API 额度。选取附件只保存在本机，发送时才上传给当前模型服务，后续上下文可能再次上传。

公网配对必须 HTTPS；LAN HTTP 兼容上游，但不提供传输加密。不要向不可信服务发送密钥、会话或文件。不跳过证书验证，不将凭据写日志，不将开发签名放入仓库。

当前是开发测试项目，尚未通过鸿蒙商店审核；编译或有限设备验证不代表无漏洞、全机型兼容或正式安全认证。

## 许可证与来源

项目使用 [MIT](LICENSE)。兼容验证使用 [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop) 的固定上游版本；其代码仅下载到忽略目录中用于测试，不打包到手机应用。依赖和图标许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

参考其他连接方案时会保留相应来源和许可，不把兼容性描述成官方背书。
