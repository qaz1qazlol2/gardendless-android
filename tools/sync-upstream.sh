#!/usr/bin/env bash
# 同步上游（Cateners/gardendless-android）的壳更新。
#
#   tools/sync-upstream.sh          只抓取并显示待合并提交
#   tools/sync-upstream.sh merge    合并到当前分支（人工解决冲突后提交）
#
# 注意：上游会改动 GameActivity / gdnext-shim.js；合并后请重点检查
#   - tauri-polyfill.js 的注入点是否仍在（onPageStarted 里 polyfill → shim）
#   - 游戏包路径是否仍是 pvzge_web-master/docs
#   - 上游若新增 @JavascriptInterface 桥方法，考虑在 polyfill 里接入
set -eu
cd "$(dirname "$0")/.."

git fetch --depth=200 upstream main 2>&1 | tail -2 || git fetch upstream main

echo
echo "── 本地尚未包含的上游提交 ──"
git log --oneline HEAD..upstream/main | head -30
COUNT=$(git rev-list --count HEAD..upstream/main)
echo "共 $COUNT 条"

if [ "${1:-}" = "merge" ] && [ "$COUNT" -gt 0 ]; then
    echo
    echo "── 合并 upstream/main ──"
    git merge --no-edit upstream/main
else
    echo
    echo "只查看，未合并。要合并请执行: tools/sync-upstream.sh merge"
fi
