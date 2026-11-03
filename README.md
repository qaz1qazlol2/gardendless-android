# gardendless-android（pvzge 壳，开源部分）

PvZ2 Gardendless 的安卓壳，**fork 自 [Cateners/gardendless-android](https://github.com/Cateners/gardendless-android)**
（Kotlin + WebView + WebViewAssetLoader），按 GPL-3.0 继续开源。

本仓库**只含壳代码，不含游戏资源**。游戏包由使用者自行放入
`app/src/main/assets/pvzge_web-master.zip`（内部路径须为
`pvzge_web-master/docs/...`），首次启动时解压到应用私有目录。

> 游戏本体、音频与模组素材不随本仓库分发。构建可运行的完整应用需要
> 自备游戏包——见 [docs/INTEGRATION.md](docs/INTEGRATION.md)。

## 与上游的差异

| 项 | 上游 | 本 fork |
|---|---|---|
| 游戏包来源 | 网页版 pvzge_web-master（自带 Tauri polyfill） | 官方桌面客户端解包（无 polyfill） |
| **`tauri-polyfill.js`** | 无 | **新增**：为官方客户端 webroot 提供 `__TAURI_INTERNALS__` 最小实现（fs/path/opener/window/event） |
| 注入顺序 | shim | **polyfill → shim**（`GameActivity.onPageStarted`） |
| applicationId | `com.fct.gardendless` | `com.pvzge.mobile`（避免与上游 APK 互相覆盖） |
| 签名 | 仓库内公开签名私钥 | 私钥不入库，本地 `keystore.properties`（见 example）；缺失时出未签名 release |
| 版本 | 0.15.x | `versionName` 跟随游戏包（0.16.8），`versionCode` 每次发版递增（也是解压版本键） |

## 构建

1. 准备游戏包：
   ```bash
   tools/make-assets-zip.sh /path/to/webroot
   # 产出 app/src/main/assets/pvzge_web-master.zip（内部 pvzge_web-master/docs/...）
   ```
2. （可选）签名：`cp keystore.properties.example keystore.properties` 并填入自有密钥
3. 构建：
   ```bash
   ./gradlew :app:assembleRelease     # 或 assembleDebug
   ```

要求：JDK 17+、Android SDK（compileSdk 36）、minSdk 27。

## 发布

- 本仓库的 Releases 只放**壳本身的构建产物**（不含游戏资源的版本）。
- 含完整资源（游戏 + 音频模组）的安装包在独立的私有仓库存放与分发。

## 许可

GPL-3.0（继承上游）。上游作者：Caten Hu / [Cateners](https://github.com/Cateners)。
`gdnext-shim.js`、`MouseGameWebView` 等壳逻辑为上游代码；本项目新增
`app/src/main/assets/tauri-polyfill.js` 并调整了注入顺序与构建配置。
