#!/bin/bash

# Trading & Strategy Bots - 带代理启动

# 设置代理
export HTTP_PROXY=http://10.19.2.25:7897
export HTTPS_PROXY=http://10.19.2.25:7897

echo "=============================================="
echo "Trading & Strategy Bots"
echo "使用代理模式启动"
echo "代理: 10.19.2.25:7897"
echo "=============================================="
echo ""

# 清理旧进程
echo "1. 清理旧进程..."
pkill -f "arbitrage-server" 2>/dev/null
pkill -f "http.server 8080" 2>/dev/null
sleep 2
echo "   ✅ 清理完成"
echo ""

# 启动后端服务器（使用代理环境变量）
echo "2. 启动后端服务器 (使用代理)..."
HTTP_PROXY=http://10.19.2.25:7897 \
HTTPS_PROXY=http://10.19.2.25:7897 \
npx ts-node src/arbitrage-server.ts > /tmp/arbitrage-server.log 2>&1 &
BACKEND_PID=$!
echo "   ✅ 后端服务器已启动 (PID: $BACKEND_PID)"
echo ""

# 等待后端启动
echo "3. 等待后端初始化..."
sleep 5

# 检查后端是否成功
if curl -s http://localhost:3002/api/status > /dev/null 2>&1; then
    echo "   ✅ 后端服务器就绪"
else
    echo "   ❌ 后端服务器启动失败"
    exit 1
fi
echo ""

# 启动前端服务器
echo "4. 启动前端服务器 (端口 8080)..."
cd /home/magic/VibeCurve/client
python3 -m http.server 8080 > /tmp/frontend-server.log 2>&1 &
FRONTEND_PID=$!
cd /home/magic/VibeCurve
echo "   ✅ 前端服务器已启动 (PID: $FRONTEND_PID)"
echo ""

# 显示访问信息
echo "=============================================="
echo "✅ 所有服务已成功启动！"
echo "=============================================="
echo ""
echo "📱 访问 Dashboard："
echo "   http://localhost:8080/pro-dashboard.html"
echo ""
echo "🔧 使用代理: 10.19.2.25:7897"
echo ""
echo "📝 查看日志："
echo "   tail -f /tmp/arbitrage-server.log"
echo ""
echo "=============================================="

# 保存 PID
echo $BACKEND_PID > /tmp/arbitrage-backend.pid
echo $FRONTEND_PID > /tmp/arbitrage-frontend.pid
