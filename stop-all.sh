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
