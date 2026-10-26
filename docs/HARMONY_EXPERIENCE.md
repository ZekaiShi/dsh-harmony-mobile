# 鸿蒙交互体验与默认按钮规范

工作台底部「交互体验 · 握姿与光感」提供自动跟随握姿、固定左手和固定右手。DSH 与独立聊天的发送、停止按钮跟随所选侧布局；消息顺序、正文和输入框不镜像。未知、双手或未握持时回到右侧。只持久化布局偏好，不保存或上传握姿状态。

## 智感握姿

- 使用官方 `@kit.MultimodalAwarenessKit` 的 `motion.on('holdingHandChanged', callback)`，按 `HoldingHandStatus` 接收左手、右手、双手、未握持状态。
- 声明 `ohos.permission.DETECT_GESTURE`；SDK PermissionDefinitions.json 将其定义为 normal / system_grant，无需运行时弹出运动权限授权。没有追加相机、麦克风或位置权限。
- 先检查 `SystemCapability.MultimodalAwareness.Motion`，订阅失败或权限不可用时展示明确状态并保留手动选项。成功订阅仅表示等待状态，不冒充已识别握持。
- 仅应用前台、自动模式订阅；退后台、销毁或切换手动布局时按本应用的 callback 解除监听。400ms 稳定窗口抑制快速抖动，取消未完成的更新，过期回调不改变当前布局。
- 模拟器验证手动布局、偏好持久化与不支持提示；真实左右手、双手及折叠设备姿态仍需支持的真机验收。

## 沉浸光感

- 当前 target / compatible SDK 26.0.0。entry 的 metadata 配置 `ohos.arkui.UIMaterial.state=enable`。
- 新增导航及动作默认复用 `NativeTitleAction`：44vp 圆形，官方 SymbolGlyph、无障碍名称、禁用/等待状态，并由 `NativeCircleStyle(44, true)` 请求真实 `uiMaterial.ImmersiveMaterial`。组件必须放在支持的 Navigation/NavDestination 标题栏，不能放在普通正文行后声称材质已生效。
- 保存、AI 命名等功能动作同样遵循这项默认规范，不要求用户逐个指出。现有返回按钮沿用相同 NativeCircleStyle；标题栏整条背景保留页面底色，不给整条栏添加材质条带。
- 系统选择菜单、选择器、文本长按菜单与弹窗按应用级配置使用系统材质。聊天阅读区与输入区保留普通背景：官方当前文档限制了普通组件的材质生效区域，不在任意聊天卡片上伪造官方光感。
- `deviceInfo.apiAvailable('26.0.0')`、设备材质支持与应用材质状态均有检查；不支持时使用原有主题背景。实际材质等级、深浅色、用户在系统设置选择的光感强度由系统管理。
- 编译和模拟器运行不能证明真机上的折射、高光、动效和功耗；交付报告明确这些验证边界。

## 重命名

重命名使用独立 NavDestination，从聊天页沿原生动画进入，保存或返回按原生动画回到同一会话。避免在正文中直接插入一排输入框和按钮，导致消息列表跳动。返回转场期间保留输入文字，不提前清空造成闪白。

保存及 AI 命名使用标题栏的 NativeTitleAction。AI 生成的是可编辑建议，保存后才改变会话标题；返回不保存会保留原名。手动保存不调用模型；AI 按当前模型请求并计入用量，使用既有命名指令和输出上限。空名称不能保存，生成期间显示等待状态并禁止重复点击。

官方依据：

- [开启沉浸光感](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable)
- [沉浸光感简介](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense-overview)
- [HarmonyOS 6.0/6.1 新能力：智感握姿](https://developer.huawei.com/consumer/cn/features/6-1)
- 本机构建 SDK 的 `@ohos.multimodalAwareness.motion.d.ts`、`@ohos.arkui.uiMaterial.d.ts`、`navigation.d.ts` 和 `PermissionDefinitions.json`。

## 同版修复

DSH 会话标题以 `projections.values.title`、`sessionTitle`、`session.title` 的优先级解析，兼容旧顶层 title；列表、打开会话及新快照/历史的标题保持一致。桌面改名通过新快照、历史刷新或返回列表刷新反映。

Markdown 表格按可读宽度计算各列，单列 96–300vp；每行 Flex Stretch 使边框与背景等高。长表横向滚动，显示提示；文件链接、行内代码和单元格换行保留。

DSH 与独立聊天列表的触摸事件清理输入焦点并收起系统输入法；不清空草稿、不阻止子节点链接/复制操作。重新点击输入框可继续输入。

独立聊天设置中的密钥存在状态按当前地址异步读取；忽略地址框重复回报同一个值，并丢弃过期查询结果，避免页面重新显示时误隐藏密钥删除入口。
