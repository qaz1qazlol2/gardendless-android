# gardendless-android（pvzge 壳，开源部分）

PvZ2 Gardendless 的安卓壳，**fork 自 [Cateners/gardendless-android](https://github.com/Cateners/gardendless-android)**
（Kotlin + WebView + WebViewAssetLoader），按 GPL-3.0 继续开源。

本仓库**只含壳代码，不含游戏资源**。游戏包由使用者自行放入
`app/src/main/assets/pvzge_web-master.zip`（内部路径须为
`pvzge_web-master/docs/...`），首次启动时解压到应用私有目录。

> 游戏本体、音频与模组素材不随本仓库分发。构建可运行的完整应用需要
> 自备游戏包——见 [docs/INTEGRATION.md](docs/INTEGRATION.md)。

## 与上游的差异

基线：上游 **v0.15.0**（`0f1c040`，Support mods）。除下表列出的文件外，壳代码
与其逐字节相同——`gdnext-shim.js`、`GameDocumentsProvider.kt`、
`AspectRatioFrameLayout.kt` 均未改动，上游后续更新可直接合并。

| 项 | 上游 | 本 fork |
|---|---|---|
| 游戏包来源 | 网页版 pvzge_web-master（自带 Tauri polyfill） | 官方桌面客户端解包（无 polyfill） |
| **`tauri-polyfill.js`** | 无 | **新增**：为官方客户端 webroot 提供 `__TAURI_INTERNALS__` 最小实现（fs/path/opener/window/event） |
| 注入顺序 | shim | **polyfill → shim**（`GameActivity.onPageStarted`） |
| applicationId | `com.fct.gardendless` | 同上（保留原包名，便于覆盖升级并继承存档） |
| 签名 | 仓库内公开签名私钥 | 私钥不入库，本地 `keystore.properties`（见 example）；缺失时出未签名 release |
| 版本 | 0.15.x | `versionName` 跟随游戏包（0.16.8），`versionCode` 每次发版递增（也是解压版本键，须 ≥ 已装版本） |

## 构建

1. 准备游戏包：自行制作 `app/src/main/assets/pvzge_web-master.zip`
   （内部路径必须是 `pvzge_web-master/docs/...`，详见
   [docs/INTEGRATION.md](docs/INTEGRATION.md)）
2. （可选）签名：`cp keystore.properties.example keystore.properties` 并填入自有密钥
3. 构建：
   ```bash
   ./gradlew :app:assembleRelease     # 或 assembleDebug
   ```

要求：JDK 17+、Android SDK（compileSdk 36）、minSdk 27。

## 触控映射

游戏只认鼠标，壳把触摸翻译成鼠标事件（`MouseGameWebView`），并屏蔽
`GameCanvas` 上的原生触摸，避免同一操作产生两套事件：

| 手势 | 映射 |
|---|---|
| 单指按下 / 拖动 / 抬起 | 左键按下 → 移动 → 抬起（放置植物、选卡、拖拽） |
| 双指上下滑 | 滚轮（地图缩放/滚动） |
| 双指轻点 | 右键单击 |

两个容易踩的点（都已处理，改动前请先读）：

1. **按下前必须先发 `mousemove`**。游戏自己维护光标，只被 `mousemove`
   更新；只发 `mousedown` 会让操作落在上一次光标位置（放植物、点僵尸
   会"跳到上一个点"）。
2. **合成事件要逐帧派发**（`window.__gdInput`，16ms 一个）。mousemove 与
   mousedown 同一帧到达时，游戏 update() 里缓存的光标还没刷新，表现就是
   "第一次点不生效，第二次才在上次位置生效"。
3. 合成点击带**命中判定**：落点被 gp-next 浮层（F9 徽标、面板）盖住时直接
   丢弃。所以**面板打开期间游戏收不到触摸、面板本身正常响应**，这是预期
   行为，不是 bug。

调试：页面 console 会转发到 logcat（`adb logcat -s WebViewConsole`）；
需要 chrome://inspect 时用 `-PwebviewDebug=true` 构建（默认关闭）。
手动测试时**不要用 adb 返回键**关面板——那会触发壳的退出确认框，盖住
WebView，看起来像"触摸全失效"；用面板右上角的关闭按钮。

## 发布

本仓库的 Releases 只放**壳本身的构建产物**（不含游戏资源）。

## 许可

GPL-3.0（继承上游）。上游作者：Caten Hu / [Cateners](https://github.com/Cateners)。
`gdnext-shim.js`、`MouseGameWebView` 等壳逻辑为上游代码；本项目新增
`app/src/main/assets/tauri-polyfill.js` 并调整了注入顺序与构建配置。

## 开发说明

本项目的改造与实现（polyfill、注入接线、构建配置、文档与工具）由
**DeepSeek 4.1 Flash** 与 **GLM 5.3 Flash** 辅助完成。

