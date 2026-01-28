#!/bin/bash

# 快速启动脚本 - 启动所有服务

echo "🚀 启动 VibeCurve 所有服务..."

# 停止现有服务
./stop.sh 2>/dev/null

# 创建日志目录
mkdir -p logs

# 1. Sniper
echo "启动 Sniper..."
nohup npm start > logs/sniper.log 2>&1 &
echo $! > sniper.pid

# 2. Arbitrage Server
echo "启动 Arbitrage Server (端口 3002)..."
nohup npm run arbitrage > logs/arbitrage.log 2>&1 &
echo $! > arbitrage.pid

# 3. Web Socket Server
echo "启动 Web Socket Server (端口 3001)..."
nohup npm run server > logs/web-server.log 2>&1 &
echo $! > web-server.pid

# 4. 前端文件服务器
echo "启动前端文件服务器 (端口 8080)..."
cd client
nohup python3 -m http.server 8080 > ../logs/frontend.log 2>&1 &
echo $! > ../frontend.pid
cd ..

echo ""
echo "✅ 所有服务已启动！"
echo ""
echo "📡 服务端点："
echo "   - 前端界面:    http://localhost:8080/pro-dashboard.html"
echo "   - Arbitrage:   http://localhost:3002"
echo "   - WebSocket:   http://localhost:3001"
echo ""
echo "📝 查看日志："
echo "   tail -f logs/sniper.log"
echo "   tail -f logs/arbitrage.log"
echo "   tail -f logs/frontend.log"
echo ""
echo "🛑 停止服务: ./stop.sh"
echo ""

# 等待并显示日志
sleep 3
echo "正在显示实时日志（Ctrl+C 退出，服务继续运行）..."
sleep 2
tail -f logs/arbitrage.log
