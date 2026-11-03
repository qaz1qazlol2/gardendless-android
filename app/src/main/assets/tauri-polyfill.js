/*
 * tauri-polyfill.js —— 为官方客户端 webroot 提供最小 __TAURI_INTERNALS__ 实现
 *
 * 背景：
 *   本仓库官方（Cateners/gardendless-android）配套的游戏包是网页版
 *   pvzge_web-master，其 index.html 内联了一份 Tauri polyfill。
 *   而本项目使用的游戏包来自官方桌面客户端解包（含 gp-next），页面里没有
 *   任何 polyfill —— 它假定运行在真实 Tauri 壳里。因此这里补一份最小实现：
 *
 *     - __TAURI_INTERNALS__.invoke / transformCallback / unregisterCallback
 *     - __TAURI__ 命名空间（core.invoke / event / window 等最小面）
 *
 *   命令面按本项目 0.16.8 游戏包实际调用的集合实现（fs / path / opener /
 *   window / event），其余命令返回 null 并在控制台告警，便于按需补齐。
 *
 * 与原生桥的分工（见 GameActivity 的 GardendlessBridge）：
 *   fs 读 → AssetLoader 虚拟路径 fetch（stream，无 base64 中转）
 *   fs 写 / stat / rename / mkdir / remove → 原生桥（base64 传输）
 *   全屏 → 原生桥；数据根目录 → 原生桥 appDataRoot()
 */
(function () {
    'use strict';

    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.__pvzgeImpl) return;

    var bridge = window.GardendlessBridge;
    var ORIGIN = 'https://appassets.androidplatform.net/';
    var TAG = '[pvzge-polyfill]';

    function warn() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(TAG);
        console.warn.apply(console, args);
    }

    // ── 路径归一 ──────────────────────────────────────────────
    // 游戏传给 fs 的路径可能是相对 AppData 的（gp-next\packs\...），
    // 也可能是 resolve_directory 返回值拼出的绝对路径。
    var appRootCache = null;
    function appRoot() {
        if (appRootCache === null) {
            try {
                appRootCache = String(bridge.appDataRoot() || '')
                    .replace(/\\/g, '/').replace(/\/+$/, '');
            } catch (e) { appRootCache = ''; }
        }
        return appRootCache;
    }
    function relPath(p) {
        var s = String(p == null ? '' : p).replace(/\\/g, '/').replace(/^\/+/, '');
        var root = appRoot();
        if (root && s.indexOf(root + '/') === 0) s = s.slice(root.length + 1);
        return s;
    }
    function urlOf(p) { return ORIGIN + relPath(p); }

    var placeholderRid = 0;

    // ── 回调表（@tauri-apps/api 的 transformCallback 契约）─────
    var nextCbId = 1;
    var callbacks = {};
    function transformCallback(cb, once) {
        var id = nextCbId++;
        callbacks[id] = { fn: cb, once: !!once };
        return id;
    }
    function unregisterCallback(id) { delete callbacks[id]; }

    // ── 工具 ─────────────────────────────────────────────────
    function bytesOf(payload) {
        if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
        if (payload && payload.buffer instanceof ArrayBuffer)
            return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
        if (typeof payload === 'string') return new TextEncoder().encode(payload);
        return new Uint8Array(0);
    }
    function textOf(payload) {
        if (typeof payload === 'string') return payload;
        return new TextDecoder().decode(bytesOf(payload));
    }
    function b64(bytes) {
        var chunk = 0x8000, parts = '';
        for (var i = 0; i < bytes.length; i += chunk) {
            parts += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(parts);
    }
    function readStream(stream) {
        var reader = stream.getReader(), chunks = [], total = 0;
        function pump() {
            return reader.read().then(function (r) {
                if (r.done) {
                    reader.releaseLock();
                    var out = new Uint8Array(total), off = 0;
                    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
                    return out;
                }
                chunks.push(r.value); total += r.value.length;
                return pump();
            });
        }
        return pump();
    }
    function readBytes(p, label) {
        return fetch(urlOf(p), { cache: 'no-store' }).then(function (res) {
            if (!res.ok) throw new Error(label + ' failed (' + res.status + '): ' + relPath(p));
            return res.arrayBuffer();
        });
    }

    // ── 命令实现 ─────────────────────────────────────────────
    function handle(cmd, args, options) {
        var body = args;

        switch (cmd) {
            case 'plugin:path|resolve_directory':
                return Promise.resolve(appRoot() || '/');

            case 'plugin:path|basename':
                return Promise.resolve(String((args && args.path) || '').split(/[\\/]/).pop() || '');

            case 'plugin:path|dirname': {
                var segs = String((args && args.path) || '').split(/[\\/]/);
                segs.pop();
                return Promise.resolve(segs.join('/'));
            }

            case 'plugin:fs|read_text_file':
                return readBytes(args && args.path, 'read_text_file');
            case 'plugin:fs|read_file':
                return readBytes(args && args.path, 'read_file');

            case 'plugin:fs|stat':
            case 'plugin:fs|lstat': {
                var st = bridge.fsStat(relPath(args && args.path));
                if (st === null || st === undefined) throw new Error(cmd + ' failed: ' + relPath(args && args.path));
                return Promise.resolve(JSON.parse(st));
            }

            case 'plugin:fs|read_dir': {
                var list = bridge.fsReadDir(relPath(args && args.path));
                return Promise.resolve(list === null ? [] : JSON.parse(list));
            }

            case 'plugin:fs|exists':
                return Promise.resolve(!!bridge.fsExists(relPath(args && args.path)));

            case 'plugin:fs|mkdir':
                bridge.fsMkdir(relPath(args && args.path));
                return Promise.resolve(null);

            case 'plugin:fs|remove':
                bridge.fsRemove(relPath(args && args.path));
                return Promise.resolve(null);

            case 'plugin:fs|rename':
                if (!bridge.fsRename(relPath(args.oldPath), relPath(args.newPath)))
                    throw new Error('rename failed: ' + relPath(args.oldPath));
                return Promise.resolve(null);

            // 流式写：invoke(cmd, body, { headers: { path } })
            case 'plugin:fs|write_file': {
                var h = (options && options.headers) || {};
                var wp = h.path ? decodeURIComponent(h.path) : (args && args.path);
                if (!wp) throw new Error('write_file requires a path');
                var write = function (bytes) {
                    if (!bridge.fsWriteBytes(relPath(wp), b64(bytes))) throw new Error('write_file failed: ' + wp);
                    return null;
                };
                if (body && typeof body.getReader === 'function')
                    return readStream(body).then(write);
                return Promise.resolve(write(bytesOf(body)));
            }

            case 'plugin:fs|write_text_file': {
                var h2 = (options && options.headers) || {};
                var tp = h2.path ? decodeURIComponent(h2.path) : (args && args.path);
                if (!tp) throw new Error('write_text_file requires a path');
                if (!bridge.fsWriteText(relPath(tp), textOf(body))) throw new Error('write_text_file failed: ' + tp);
                return Promise.resolve(null);
            }

            // 启动恢复门禁：null = 没有恢复日志，正常启动（官方壳同名命令）
            case 'cloud_journal_read':
            case 'cloud_open':
            case 'cloud_startup_result':
            case 'update_macos_menu':
                return Promise.resolve(null);

            // 每日关卡深链（Android 无深链，返回 null 让监听器安静退出）
            case 'plugin:deep-link|get_current':
                return Promise.resolve(null);

            case 'plugin:opener|open_path':
                try { bridge.openDataFolder(); } catch (e) { /* ignore */ }
                return Promise.resolve(null);

            case 'plugin:opener|open_url':
                // 交给 WebViewClient.shouldOverrideUrlLoading 用系统浏览器打开
                if (args && args.url) window.open(String(args.url), '_blank');
                return Promise.resolve(null);

            // 图像：返回占位 rid（模组图标等会显示为空白，但不影响功能）
            case 'plugin:image|from_bytes':
            case 'plugin:image|from_path':
                return Promise.resolve({ rid: ++placeholderRid });
            case 'plugin:image|rgba':
                return Promise.resolve(new Uint8Array(4));
            case 'plugin:image|size':
                return Promise.resolve({ width: 64, height: 64 });

            // 存档 / 键位导入导出：游戏在 Tauri 分支调用这两个自定义命令
            case 'save_text_file': {
                var dn = (args && args.defaultName) || 'save.json';
                var ct = (args && args.content) || '';
                if (!bridge.saveTextFile) { warn(cmd, 'not supported by native bridge yet'); return Promise.resolve(null); }
                return Promise.resolve(!!bridge.saveTextFile(String(dn), String(ct)));
            }
            case 'open_text_file':
                if (!bridge.openTextFile) { warn(cmd, 'not supported by native bridge yet'); return Promise.resolve(null); }
                return Promise.resolve(bridge.openTextFile() || null);

            case 'plugin:dialog|save': {
                // 兜底：无原生保存对话框时返回 null，游戏会退回 <a download> 路径
                if (!bridge.saveTextFile) return Promise.resolve(null);
                return Promise.resolve(null);
            }

            case 'plugin:window|set_fullscreen':
                try { bridge.setFullscreen(!!(args && args.value)); } catch (e) { /* ignore */ }
                return Promise.resolve(null);

            case 'plugin:window|is_fullscreen':
                return Promise.resolve(false);
            case 'plugin:window|is_maximized':
            case 'plugin:window|is_minimized':
                return Promise.resolve(false);
            case 'plugin:window|is_focused':
                return Promise.resolve(true);
            case 'plugin:window|get_all_windows':
                return Promise.resolve([{ label: 'main' }]);
            case 'plugin:window|outer_size':
                return Promise.resolve({ width: window.outerWidth || window.innerWidth, height: window.outerHeight || window.innerHeight });
            case 'plugin:window|inner_position':
            case 'plugin:window|outer_position':
                return Promise.resolve({ x: window.screenX || 0, y: window.screenY || 0 });
            case 'plugin:window|set_size':
            case 'plugin:window|set_position':
            case 'plugin:window|center':
            case 'plugin:window|hide':
            case 'plugin:window|show':
                return Promise.resolve(null);
            case 'plugin:window|scale_factor':
                return Promise.resolve(window.devicePixelRatio || 1);
            case 'plugin:window|inner_size':
                return Promise.resolve({ width: window.innerWidth, height: window.innerHeight });
            case 'plugin:window|close':
                try { bridge.quitApp && bridge.quitApp(); } catch (e) { /* ignore */ }
                return Promise.resolve(null);
        }
        return null;
    }

    var FS_PREFIX = /^plugin:fs\|/;

    function invoke(cmd, args, options) {
        var name = String(cmd || '');
        // notify/listen 走本地回调表
        if (name === 'plugin:event|listen') return Promise.resolve(transformCallback(function () {}, false));
        if (name === 'plugin:event|unlisten') { unregisterCallback(args && args.eventId); return Promise.resolve(null); }
        if (name === 'plugin:event|emit' || name === 'plugin:event|emit_to') return Promise.resolve(null);

        if (FS_PREFIX.test(name) || name === 'plugin:path|resolve_directory' ||
            name === 'plugin:opener|open_path' || name.indexOf('plugin:window|') === 0) {
            try {
                var r = handle(name, args || {}, options);
                if (r) return r;
            } catch (e) {
                warn(name, 'failed:', e);
                return Promise.reject(e);
            }
        }

        warn('unhandled command:', name);
        return Promise.resolve(null);
    }

    // ── 安装 ─────────────────────────────────────────────────
    var internals = window.__TAURI_INTERNALS__ || {};
    internals.invoke = invoke;
    internals.transformCallback = transformCallback;
    internals.unregisterCallback = unregisterCallback;
    internals.convertFileSrc = function (p) { return urlOf(p); };
    internals.__pvzgeImpl = true;
    window.__TAURI_INTERNALS__ = internals;

    // @tauri-apps/api 的 window.__TAURI__ 面（部分游戏代码直接用它）
    window.__TAURI__ = window.__TAURI__ || {};
    window.__TAURI__.core = window.__TAURI__.core || { invoke: invoke };
    window.__TAURI__.event = window.__TAURI__.event || {
        listen: function () { return Promise.resolve(function () {}); },
        emit: function () { return Promise.resolve(); }
    };

    // 不要伪造 window.electronAPI：游戏的 ElectronAPI 静态类会直接调
    // electronAPI.window() / openUrl() / getMassageSync() 等一整套方法，
    // 缺任何一个都会抛 "n.window is not a function" 并把启动打断。
    // 官方 Tauri 客户端本就没有 electronAPI，全部调用点是 `null==(n=s())||...`
    // 短路成空操作，这里保持一致。

    console.log(TAG, 'installed, appData =', appRoot());
})();
