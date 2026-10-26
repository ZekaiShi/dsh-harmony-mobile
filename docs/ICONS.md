# 图标资源 · 0.3.2

0.8.1 按用户明确要求，附件菜单使用两枚本地线描 SVG：ic_attach_image（图片）和 ic_attach_file（回形针），base/dark 各一份。由本项目绘制，不声称是华为官方素材；其余系统操作继续使用下列 HarmonyOS Symbol。

通用操作使用华为官方 SDK 的系统符号，以 `SymbolGlyph` / `SymbolSpan` 渲染，不再维护自画的通用 SVG。通过 `fontSize`、`fontWeight` 和主题颜色统一视觉样式。

官方入口：[HarmonyOS Symbol](https://developer.huawei.com/consumer/cn/design/harmonyos-symbol/)、[设计资源](https://developer.huawei.com/consumer/cn/design/resource/)、[SymbolGlyph API](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/ts-basic-components-symbolglyph)。

| 用途 | 官方系统资源 |
| --- | --- |
| 会话入口 | `sys.symbol.line_3_horizontal` |
| 刷新 | `sys.symbol.arrow_clockwise` |
| 新会话 | `sys.symbol.square_and_pencil` |
| 展开/列表箭头 | `sys.symbol.chevron_right` |
| 运行命令 | `sys.symbol.code_square` |
| 编辑文件 | `sys.symbol.pencil_line` |
| 查看/生成图片 | `sys.symbol.picture` |
| 搜索 | `sys.symbol.magnifyingglass` |
| 读取文件 | `sys.symbol.doc_text` |
| 网页访问 | `sys.symbol.worldclock` |
| 其他工具 | `sys.symbol.wrench_and_screwdriver` |
| 思考/空会话提示 | `sys.symbol.lightbulb` |
| 复制回复 | `sys.symbol.doc_text_on_doc_text` |
| 发送 | `sys.symbol.arrow_up` |
| 停止回复 | `sys.symbol.square_fill` |
| 正文文件引用 | `sys.symbol.doc`（SymbolSpan） |

名称已在本机官方 API 26 SDK 的 `ets/build-tools/ets-loader/sysResource.js` 和 `toolchains/id_defined.json` 核对，并由实际 ArkTS 编译验证。模拟器检查图标节点类型与截图；未据此宣称物理设备或旧系统版本的实际表现已验证。

系统符号由鸿蒙运行时提供，没有把 SDK 字体或官网整套素材打包、重新授权为本项目 MIT 资源。GitHub 品牌标识继续使用独立的 SVG（Feather MIT，许可随 HAP 保存）；应用图标为本项目独立标识，不使用华为品牌图标冒充官方客户端。
