# 市场收录准备

客户端仓库：https://github.com/ZekaiShi/dsh-harmony-mobile

市场内提交对象是 `packages/desktop-sender` 的 `dsh-harmony-sender` 插件，手机应用独立提供。插件只增加人工 `/harmony-send` 文字发送命令，通过已配对的 DSH Desktop 桥接显示到手机；不宣称自己提供隧道或独立的全功能远程控制。

## 正确目标

`dsh-market/dsh-market` 是市场应用，条目来源是 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。按其 [贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，PR 只需增加一个条目。候选文件已备于 `docs/market/ZekaiShi__dsh-harmony-mobile--packages-desktop-sender.yml`，提交时放到目标仓库 `data/plugins/`。

## 提交条件

- 子包已有真正的 `dsh.bundle` 清单、Cordis patch 和可执行发送命令；预构建包放 GitHub Release，不需要执行安装脚本。
- 使用官方 `@deepseek-ai/dsh-commands@0.2.1-rc.2` peer；只声明已测试版本，较早 DSH 需要兼容性验证，不能通过强制安装绕过版本不匹配。
- 公开仓库应有 `dsh-plugin` topic，维护实际提交记录。
- 仓库创建时间为 2026-10-26 18:42:44 UTC（北京时间 10 月 27 日 02:42:44）。创建满一天的门槛最早于北京时间 **10 月 28 日 02:42:44** 达到。当前不提交一个明知不满足年龄检查的申请。
- **没有“十次提交即可合并”的规则**。十次以上真实提交是本项目的维护要求；收录仍须 CI 及维护者审核，不能承诺通过或合并。

发布前验证 tarball 链接与 `npm pack` 清单。最终申请描述只说明实际文字发送能力，不把客户端的模型/图像能力算作电脑插件功能。尚未创建市场 PR、尚未收录；没有提交鸿蒙商店。
