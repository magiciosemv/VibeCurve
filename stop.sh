#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}停止 VibeCurve 服务...${NC}"

STOPPED_COUNT=0

# 1. 停止 Docker Compose
if [ -f docker-compose.yml ]; then
    if docker-compose ps | grep -q "Up"; then
        echo "停止 Docker Compose 服务..."
        docker-compose down 2>/dev/null
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
    fi
fi

# 2. 停止各个本地服务
for pidfile in sniper.pid web-server.pid arbitrage.pid vibecurve.pid frontend.pid; do
    if [ -f $pidfile ]; then
        PID=$(cat $pidfile)
        if ps -p $PID > /dev/null 2>&1; then
            echo "停止 $pidfile (PID: $PID)..."
            kill $PID 2>/dev/null
            STOPPED_COUNT=$((STOPPED_COUNT + 1))
        fi
        rm -f $pidfile
    fi
done

# 3. 清理其他相关进程
pkill -f "node.*dist/index.js" 2>/dev/null || true
pkill -f "node.*src/index.ts" 2>/dev/null || true
pkill -f "node.*src/server.ts" 2>/dev/null || true
pkill -f "node.*src/arbitrage-server.ts" 2>/dev/null || true
pkill -f "python3.*http.server.*client" 2>/dev/null || true

# 4. 显示结果
if [ $STOPPED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✅ 已停止 $STOPPED_COUNT 个服务${NC}"
else
    echo -e "${YELLOW}⚠️  没有运行中的服务${NC}"
fi

# 5. 显示清理后的进程状态
echo ""
echo "当前运行的 VibeCurve 进程："
ps aux | grep -E "node.*(src/index|src/server|src/arbitrage)" | grep -v grep || echo "  无"
