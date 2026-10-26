回滚：把隔离目录移回 `node_modules/@deepseek-ai/`，并用 `.bak` 覆盖 `package.json`。

**Path B：走界面（不想让我动 node_modules 时）** 在安全模式插件列表里找到 `@deepseek-ai/dsh-host-apiproxy`（0.1.1-rc.2，会被标为不兼容或已阻止），勾选 →「停用所选插件」。桌面端会做带备份的移除，并自己重装、剪掉旧依赖；然后退出安全模式重启。若列表里找不到它，就回到 Path A。

**不建议的做法：** 停用 `dsh-base` 或 `dsh-web-app`（会直接导致核心启动失败）、手删包目录，或者只给 host-apiproxy 开「兼容豁免」（豁免只让它不加载，它的 0.1.1 依赖照样覆盖核心包，启动仍会失败）。

## 另外两个次要问题（不阻塞本次判定，可下一步处理）

- `dsh-better-sidebar` / `dsh-codex-subscription` 在 14:42:47 被判定为「bundle declared but not installed」并移除了 bundle 声明（[harness.log:487–490](../logs/harness.log#L487-L490)），所以现在根本不会加载；启动修好后如需使用，请去插件市场重装或升级（它们已有 generation 目录，但 profile 里没有链接，迁移一直 `deferred`）。
- 你的自建 preset `liangshen` 引用了 profile 里不存在的两个脚本：`tool-bootstrap (./tool-bootstrap.mjs): never started`、`custom-bash (./custom-bash.mjs): never started`（[harness.log:645–646](../logs/harness.log#L645-L646)），所以「梁神模式」会缺工具；需要把这两个 `.mjs` 放回 `profiles\web`，或把 patch 里对应条目改指向内置实现。要修的话我另开一步。

本轮我只做了读取，**没有修改任何文件或配置**。请确认走 Path A 还是 Path B；确认后我按步骤执行。
