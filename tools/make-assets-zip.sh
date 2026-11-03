#!/usr/bin/env bash
# 把 webroot 打包成 Android 壳期望的资源 zip。
#
#   tools/make-assets-zip.sh /path/to/webroot [输出路径]
#
# zip 内部结构必须是 pvzge_web-master/docs/<webroot 内容>（壳内路径写死）。
set -eu
cd "$(dirname "$0")/.."

SRC="${1:-}"
OUT="${2:-app/src/main/assets/pvzge_web-master.zip}"

if [ -z "$SRC" ] || [ ! -f "$SRC/index.html" ]; then
    echo "用法: tools/make-assets-zip.sh <含 index.html 的 webroot 目录> [输出 zip]" >&2
    exit 1
fi

mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "  暂存 -> $TMP/pvzge_web-master/docs"
mkdir -p "$TMP/pvzge_web-master/docs"
cp -r "$SRC/." "$TMP/pvzge_web-master/docs/"

echo "  压缩中（deflate 是 store 的 3-4 倍速，体积略大；需要极限压缩改 -0 为 -9）"
( cd "$TMP" && zip -q -r -0 "assets.zip" pvzge_web-master )

mv "$TMP/assets.zip" "$OUT"
echo "  完成: $OUT  ($(du -h "$OUT" | cut -f1))"
echo
echo "  提示: 改完游戏包请同步递增 app/build.gradle.kts 的 versionCode，"
echo "        否则应用不会重新解压（GameActivity 用 versionCode 做版本键）。"
