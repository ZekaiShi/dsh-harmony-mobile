# dsh-harmony-mobile

面向 HarmonyOS 的社区原生 AI 客户端，使用 ArkUI。手机可直接连接用户配置的模型 API，也可连接电脑上的 DSH Desktop，继续电脑端会话与任务。

本项目独立维护，不是 DeepSeek、Dataelem 或华为的官方客户端。

## 当前基线

从已经验证的 0.8.6 原生客户端建立，包含：

- 独立聊天、流式回复、本地历史与草稿、原生图片/文件选择、Markdown 阅读。
- 四类聊天协议：Chat Completions、Responses、Anthropic Messages、Gemini。
- 图像工作室：兼容 Images、Seedream、Gemini、SiliconFlow、OpenRouter 的相应接口。
- DSH Desktop 的现有二维码、六位 PIN、Cookie、RPC 与 SSE 连接。
- HarmonyOS 系统符号、原生导航、设备支持时的沉浸光感按钮和前台握姿适配。

DSH 插件市场接入、导出增强、服务端 Token 统计及 AI 自动命名正在开发，未完成前不列为已支持。后续电脑插件只负责配对和数据桥接，不在插件里维护另一套手机界面。

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
