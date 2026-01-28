#!/bin/bash

# VibeCurve Quick Start Script

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         VibeCurve Quick Start                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo ""
    echo "Please create a .env file:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    echo ""
    echo "Then fill in the required fields:"
    echo "  - RPC_URL"
    echo "  - PRIVATE_KEY"
    echo "  - AI_API_KEY"
    echo ""
    exit 1
fi

echo "✅ .env file found"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found!"
    echo "Please install Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js version: $NODE_VERSION"
echo ""

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found!"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✅ npm version: $NPM_VERSION"
echo ""

# 检查依赖
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "✅ Dependencies installed"
echo ""

# 选择启动模式
echo "Please select a startup mode:"
echo "  1. Demo (Simulation Mode)"
echo "  2. Strategy Server (Production Mode)"
echo "  3. Frontend Only"
echo "  4. Run Tests"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Demo..."
        echo ""
        npm run demo
        ;;
    2)
        echo ""
        echo "🚀 Starting Strategy Server..."
        echo ""
        npm run strategy-server
        ;;
    3)
        echo ""
        echo "🚀 Starting Frontend..."
        echo ""
        cd client
        python3 -m http.server 8080
        ;;
    4)
        echo ""
        echo "🧪 Running Tests..."
        echo ""
        npm test
        ;;
    *)
        echo ""
        echo "❌ Invalid choice!"
        exit 1
        ;;
esac
