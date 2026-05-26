#!/bin/bash
# IndexNow 推送脚本（纯 curl，零依赖，专为 CI 环境设计）
# 用法: bash src/scripts/indexnow.sh [limit]
# 用法: bash src/scripts/indexnow.sh --url "https://..."

set -euo pipefail

SITE_HOST="ai999999.top"
API_KEY="25dae7e87ad508621408a0351647d05d19fa4c606d8266bfffa947146a16c4ac"
SITEMAP_URL="https://ai999999.top/sitemap.xml"
INDEXNOW_API="https://api.indexnow.org/indexnow"
LIMIT="${1:-}"

echo "══════════════════════════════════════════"
echo "  IndexNow 推送工具 (bash)"
echo "  站点: $SITE_HOST"
echo "══════════════════════════════════════════"
echo ""

# 如果是单条推送
if [ "${1:-}" = "--url" ] && [ -n "${2:-}" ]; then
  echo "📤 推送单条: $2"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$INDEXNOW_API" \
    -H "Content-Type: application/json" \
    -d "{\"host\":\"$SITE_HOST\",\"key\":\"$API_KEY\",\"keyLocation\":\"https://$SITE_HOST/$API_KEY.txt\",\"urlList\":[\"$2\"]}" \
    --max-time 10)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
    echo "✅ HTTP $HTTP_CODE"
    exit 0
  else
    echo "❌ HTTP $HTTP_CODE"
    exit 1
  fi
fi

# 获取 sitemap
echo "📡 读取 sitemap..."
SITEMAP_XML=$(curl -s --max-time 15 "$SITEMAP_URL")
URLS=$(echo "$SITEMAP_XML" | grep -oP '<loc>\K[^<]+')
TOTAL=$(echo "$URLS" | wc -l)
echo "✅ 解析到 $TOTAL 条 URL"

# 应用 limit
if [ -n "$LIMIT" ] && [ "$LIMIT" -gt 0 ] 2>/dev/null; then
  URLS=$(echo "$URLS" | head -n "$LIMIT")
  TOTAL=$LIMIT
  echo "📐 截取前 $LIMIT 条"
fi

echo ""
echo "🚀 开始推送 $TOTAL 条（每批 50 条，间隔 100ms）"
echo ""

BATCH_SIZE=50
BATCH_DELAY_MS=100
SUCCESS=0
FAILED=0
BATCH_NUM=0

# Process with while loop
TMPFILE=$(mktemp)
echo "$URLS" > "$TMPFILE"

while IFS= read -r line; do
  [ -z "$line" ] && continue
  
  # Build batch
  BATCH="[\"$line\""
  COUNT=1
  while IFS= read -r next && [ $COUNT -lt $BATCH_SIZE ]; do
    [ -z "$next" ] && continue
    BATCH="$BATCH,\"$next\""
    COUNT=$((COUNT + 1))
  done
  BATCH="$BATCH]"
  
  BATCH_NUM=$((BATCH_NUM + 1))
  TOTAL_BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))
  printf "  [%d/%d] " "$BATCH_NUM" "$TOTAL_BATCHES"
  
  # Submit batch with retries
  RETRY=0
  HTTP_CODE=""
  while [ $RETRY -le 3 ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$INDEXNOW_API" \
      -H "Content-Type: application/json" \
      -d "{\"host\":\"$SITE_HOST\",\"key\":\"$API_KEY\",\"keyLocation\":\"https://$SITE_HOST/$API_KEY.txt\",\"urlList\":$BATCH}" \
      --max-time 15)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
      break
    fi
    
    RETRY=$((RETRY + 1))
    if [ $RETRY -le 3 ]; then
      WAIT=$((1 << RETRY))
      [ $WAIT -gt 10 ] && WAIT=10
      echo "HTTP $HTTP_CODE 重试 $RETRY/3 (${WAIT}s)..."
      sleep "$WAIT"
    fi
  done
  
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
    echo "✅ $COUNT 条"
    SUCCESS=$((SUCCESS + COUNT))
  else
    echo "❌ HTTP $HTTP_CODE"
    FAILED=$((FAILED + COUNT))
  fi
  
  sleep 0.1
done < "$TMPFILE"

rm -f "$TMPFILE"

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ 成功: $SUCCESS"
[ "$FAILED" -gt 0 ] && echo "  ❌ 失败: $FAILED"
echo "  📊 总计: $((SUCCESS + FAILED))"
echo "══════════════════════════════════════════"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
