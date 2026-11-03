# 集成契约（游戏包 ↔ 壳）

## 1. 游戏包 zip

| 项 | 约定 |
|---|---|
| 文件名 | `app/src/main/assets/pvzge_web-master.zip` |
| 内部路径 | `pvzge_web-master/docs/...`（`docs` 是 webroot 根，含 `index.html`） |
| 解压目标 | `filesDir`（即 `/data/user/0/<applicationId>/files/pvzge_web-master/docs`） |
| 版本门控 | `versionCode` 变化即重新解压（`GameActivity.extracted_version`） |

壳内的路径是**写死**的（`File(filesDir, "pvzge_web-master/docs")`），
换包名/换结构需同步改 `GameActivity`。


## 2. 页面 origin 与存储

- 页面加载 `https://appassets.androidplatform.net/index.html`
- 该域名映射：`/gp-next/` → `filesDir/gp-next`；`/` → `.../pvzge_web-master/docs`
- **存档 = 该 origin 的 localStorage**（键 `PvZ2_PlayerProperties` 等），
  随应用数据清空而丢失，与桌面端互不相通

## 3. polyfill（本项目新增）

官方桌面客户端解包出的 webroot **不含** `__TAURI_INTERNALS__`——它假定运行在
真实 Tauri 壳里。`assets/tauri-polyfill.js` 提供最小实现，注入顺序：

```
onPageStarted → tauri-polyfill.js → gdnext-shim.js → 游戏脚本
```

已实现（按 0.16.8 游戏包实际调用面）：

| 命令 | 实现 |
|---|---|
| `plugin:path\|resolve_directory` | 原生桥 `appDataRoot()`（filesDir） |
| `plugin:path\|basename` / `dirname` | JS 侧字符串处理 |
| `plugin:opener\|open_url` | `window.open` → WebViewClient 交系统浏览器 |
| `plugin:image\|from_bytes` / `from_path` / `rgba` / `size` | 占位桩（图标空白，不崩溃） |
| `save_text_file`（自定义命令） | 原生桥 `saveTextFile` → SAF 保存对话框（复用 `<a download>` 流程） |
| `window.electronAPI` | 最小替身（导出/退出接到原生） |
| `plugin:fs\|read_text_file` / `read_file` | fetch AssetLoader 虚拟路径（ArrayBuffer） |
| `plugin:fs\|stat` / `lstat` | 原生桥 → JSON |
| `plugin:fs\|read_dir` / `exists` / `mkdir` / `remove` | 原生桥 |
| `plugin:fs\|rename` | 原生桥（`oldPath`/`newPath`） |
| `plugin:fs\|write_file` | body 可为流或字节，路径取自 `options.headers.path` |
| `plugin:fs\|write_text_file` | 同上，文本写入 |
| `plugin:opener\|open_path` | 打开 gp-next 数据目录 |
| `plugin:window\|set_fullscreen` | 原生桥；其余 window 读命令返回静态值 |
| `plugin:event\|listen/emit/unlisten` | 本地回调表（无跨进程事件） |

**未实现（返回 null + 控制台告警，待按需补齐）**：

- `open_text_file`（存档/键位**导入**）——需要原生异步回传大文本，另行设计
- `plugin:dialog|save` / `open` 的完整语义（导出已走 `save_text_file`）
- `plugin:deep-link|*`（每日关卡深链）
- 流式读（`fs|open`/`read`/`seek`/`fstat`/`ftruncate`）
- `plugin:drpc|*`（0.15 版 Discord RPC，0.16.8 已改用自定义命令）

补齐方式：在 `tauri-polyfill.js` 的 `handle()` 里加 case，必要时在
`GameActivity` 的 `GardendlessBridge` 增加 `@JavascriptInterface` 方法。

## 4. 音频

`window.audioEngine` 由游戏包自带的 `assets/game-*.js`（gp-next 入口）创建：
fetch `audio/manifest.json` → Web Audio 播放 `/audio/<name>.mp3`。
全部走 AssetLoader，**不需要壳提供音频能力**；只要 zip 内的 `audio/` 完整即可。
