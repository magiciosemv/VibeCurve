#!/bin/bash

# Trading & Strategy Bots - 一键启动脚本

echo "=============================================="
echo "Trading & Strategy Bots"
echo "自动启动所有服务"
echo "=============================================="
echo ""

# 代理配置（根据需要修改）
PROXY_HOST="10.234.105.251"
PROXY_PORT="7897"

export HTTP_PROXY=http://$PROXY_HOST:$PROXY_PORT
export HTTPS_PROXY=http://$PROXY_HOST:$PROXY_PORT

echo "代理设置: $HTTP_PROXY"
echo ""

# 检查并停止旧进程
echo "1. 清理旧进程..."
pkill -f "arbitrage-server" 2>/dev/null
pkill -f "http.server 8080" 2>/dev/null
sleep 2
echo "   [OK] Cleanup complete"
echo ""

# 启动后端服务器
echo "2. 启动后端服务器 (端口 3002)..."
npx ts-node src/arbitrage-server.ts > /tmp/arbitrage-server.log 2>&1 &
BACKEND_PID=$!
echo "   [OK] 后端服务器已启动 (PID: $BACKEND_PID)"
echo ""

# 等待后端启动
echo "3. 等待后端初始化..."
sleep 5

# 检查后端是否成功
if curl -s http://localhost:3002/api/status > /dev/null 2>&1; then
    echo "   [OK] 后端服务器就绪"
else
    echo "   [ERROR] 后端服务器启动失败，请检查日志: /tmp/arbitrage-server.log"
    exit 1
fi
echo ""

# 启动前端服务器
echo "4. 启动前端服务器 (端口 8080)..."
cd /home/magic/VibeCurve/client
python3 -m http.server 8080 > /tmp/frontend-server.log 2>&1 &
FRONTEND_PID=$!
cd /home/magic/VibeCurve
echo "   [OK] 前端服务器已启动 (PID: $FRONTEND_PID)"
echo ""

# 显示访问信息
echo "=============================================="
echo "[OK] 所有服务已成功启动！"
echo "=============================================="
echo ""
echo "[DASH] 访问 Dashboard："
echo "   http://localhost:8080/pro-dashboard.html"
echo ""
echo "[API] 后端 API："
echo "   http://localhost:3002/api/status"
echo ""
echo "[LOG] 查看日志："
echo "   后端: tail -f /tmp/arbitrage-server.log"
echo "   前端: tail -f /tmp/frontend-server.log"
echo ""
echo "[STOP]  停止所有服务："
echo "   按 Ctrl+C 或运行: ./stop-all.sh"
echo ""
echo "=============================================="
echo ""
echo "提示: 关闭此窗口不会停止服务"
echo "      服务会在后台持续运行"
echo ""

# 保存 PID 以便后续停止
echo $BACKEND_PID > /tmp/arbitrage-backend.pid
echo $FRONTEND_PID > /tmp/arbitrage-frontend.pid

# 创建停止脚本
cat > /home/magic/VibeCurve/stop-all.sh << 'EOF'
#!/bin/bash
echo "停止所有服务..."
if [ -f /tmp/arbitrage-backend.pid ]; then
    kill $(cat /tmp/arbitrage-backend.pid) 2>/dev/null
    rm /tmp/arbitrage-backend.pid
fi
if [ -f /tmp/arbitrage-frontend.pid ]; then
    kill $(cat /tmp/arbitrage-frontend.pid) 2>/dev/null
    rm /tmp/arbitrage-frontend.pid
fi
pkill -f "arbitrage-server" 2>/dev/null
pkill -f "http.server 8080" 2>/dev/null
echo "所有服务已停止"
EOF
chmod +x /home/magic/VibeCurve/stop-all.sh

echo "[OK] 停止脚本已创建: ./stop-all.sh"
echo ""

# 保持脚本运行
trap "echo ''; echo '正在停止服务...'; ./stop-all.sh; echo '服务已停止'; exit 0" SIGINT SIGTERM

wait
