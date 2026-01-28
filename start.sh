#!/bin/bash

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的信息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}═════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═════════════════════════════════════════════════════${NC}\n"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 未安装，请先安装"
        exit 1
    fi
}

# 检查端口是否被占用
check_port() {
    PORT=$1
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "端口 $PORT 已被占用"
        read -p "是否继续？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 主函数
main() {
    print_header "VibeCurve 项目启动脚本"

    # 1. 检查必要工具
    print_info "检查环境..."
    check_command node
    check_command npm
    check_command git

    NODE_VERSION=$(node -v)
    NPM_VERSION=$(npm -v)
    print_success "Node.js: $NODE_VERSION, npm: $NPM_VERSION"

    # 2. 检查 Docker（可选）
    DOCKER_AVAILABLE=false
    if command -v docker &> /dev/null; then
        DOCKER_AVAILABLE=true
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
        print_success "Docker: $DOCKER_VERSION"

        if command -v docker-compose &> /dev/null; then
            COMPOSE_VERSION=$(docker-compose --version | awk '{print $4}' | tr -d ',')
            print_success "Docker Compose: $COMPOSE_VERSION"
        fi
    else
        print_warning "Docker 未安装，将使用本地启动方式"
    fi

    # 3. 环境变量配置
    print_header "配置环境变量"

    if [ ! -f .env ]; then
        print_warning ".env 文件不存在，正在创建..."

        if [ -f .env.production.example ]; then
            cp .env.production.example .env
            print_success ".env 文件已创建"

            print_warning "⚠️  请编辑 .env 文件，填入以下必需配置："
            echo "   - RPC_URL (Solana RPC 节点)"
            echo "   - PRIVATE_KEY (钱包私钥)"
            echo "   - AI_API_KEY (DeepSeek API Key)"
            echo ""
            read -p "是否现在编辑 .env 文件？(y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                ${EDITOR:-nano} .env
            fi
        else
            print_error ".env.production.example 不存在"
            exit 1
        fi
    else
        print_success ".env 文件已存在"
    fi

    # 4. 验证环境变量
    print_info "验证环境变量配置..."
    source .env 2>/dev/null || true

    MISSING_CONFIGS=0

    if [ -z "$RPC_URL" ] || [ "$RPC_URL" = "YOUR_HELIUS_API_KEY_HERE" ]; then
        print_warning "RPC_URL 未配置"
        MISSING_CONFIGS=1
    fi

    if [ -z "$PRIVATE_KEY" ] || [ "$PRIVATE_KEY" = "YOUR_BASE58_PRIVATE_KEY_HERE" ]; then
        print_warning "PRIVATE_KEY 未配置"
        MISSING_CONFIGS=1
    fi

    if [ -z "$AI_API_KEY" ] || [ "$AI_API_KEY" = "YOUR_DEEPSEEK_API_KEY_HERE" ]; then
        print_warning "AI_API_KEY 未配置"
        MISSING_CONFIGS=1
    fi

    if [ $MISSING_CONFIGS -eq 1 ]; then
        print_error "请先配置 .env 文件中的必需参数"
        read -p "是否继续启动（某些功能可能不可用）？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        print_success "环境变量配置完整"
    fi

    # 5. 安装依赖
    print_header "安装依赖"

    if [ ! -d node_modules ]; then
        print_info "正在安装 npm 依赖..."
        npm install
        print_success "依赖安装完成"
    else
        print_success "依赖已存在"
    fi

    # 6. 构建项目
    print_header "构建项目"

    if [ ! -d dist ] && [ ! -d build ]; then
        print_info "正在构建项目..."
        npm run build 2>/dev/null || print_warning "构建脚本不存在，跳过"
    else
        print_success "项目已构建"
    fi

    # 7. 选择启动方式
    print_header "选择启动方式"

    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "请选择启动方式："
        echo "  1) Docker Compose (推荐生产环境)"
        echo "  2) 本地 Node.js (推荐开发环境)"
        echo "  3) 退出"
        echo ""
        read -p "请输入选项 (1-3): " mode_choice

        case $mode_choice in
            1)
                print_info "使用 Docker Compose 启动..."

                # 检查端口
                check_port 3002

                # 构建镜像
                print_info "构建 Docker 镜像..."
                docker-compose build

                # 启动服务
                print_info "启动服务..."
                docker-compose up -d

                print_success "服务已启动"
                choice="docker"
                ;;
            2)
                print_info "使用本地 Node.js 启动..."
                choice="local"
                ;;
            3)
                print_info "退出"
                exit 0
                ;;
            *)
                print_error "无效选项"
                exit 1
                ;;
        esac
    else
        print_info "使用本地 Node.js 启动..."
        choice="local"
    fi

    # 8. 本地启动选择服务
    if [ "$choice" = "local" ]; then
        print_header "选择要启动的服务"

        echo -e "${CYAN}可用服务：${NC}"
        echo ""
        echo -e "${GREEN}1) Sniper${NC}           - Pump.fun 新代币狙击（无 Web 界面）"
        echo -e "   - 实时监控 Pump.fun 新币发布"
        echo -e "   - 自动检测买入/卖出信号"
        echo -e "   - 纯命令行模式"
        echo ""
        echo -e "${GREEN}2) Web Server${NC}      - WebSocket 演示服务器（端口 3001）"
        echo -e "   - 实时价格推送"
        echo -e "   - 前端界面: client/pro-dashboard.html"
        echo -e "   - 适合演示和测试"
        echo ""
        echo -e "${GREEN}3) Arbitrage Server${NC} - 完整套利系统（端口 3002）"
        echo -e "   - AI 驱动分析"
        echo -e "   - Jito MEV 保护"
        echo -e "   - 健康检查端点"
        echo -e "   - 前端界面: client/pro-dashboard.html"
        echo -e "   - ${YELLOW}推荐生产环境${NC}"
        echo ""
        echo -e "${GREEN}4) 启动所有服务${NC}     - 同时运行 Sniper + Arbitrage"
        echo ""
        echo "  0) 退出"
        echo ""
        read -p "请输入选项 (0-4): " service_choice

        # 创建日志目录
        mkdir -p logs

        case $service_choice in
            1)
                print_header "启动 Sniper"
                print_info "启动 Pump.fun 狙击手..."

                nohup npm start > logs/sniper.log 2>&1 &
                echo $! > sniper.pid
                print_success "Sniper 已启动 (PID: $(cat sniper.pid))"
                print_info "日志: tail -f logs/sniper.log"
                ;;

            2)
                print_header "启动 Web Server"
                check_port 3001

                print_info "启动 WebSocket 演示服务器..."

                nohup npm run server > logs/web-server.log 2>&1 &
                echo $! > web-server.pid
                print_success "Web Server 已启动 (PID: $(cat web-server.pid))"
                print_info "访问: http://localhost:3001"
                print_info "前端: 打开 client/pro-dashboard.html"
                ;;

            3)
                print_header "启动 Arbitrage Server"
                check_port 3002

                print_info "启动完整套利系统..."

                nohup npm run arbitrage > logs/arbitrage.log 2>&1 &
                echo $! > arbitrage.pid
                print_success "Arbitrage Server 已启动 (PID: $(cat arbitrage.pid))"
                print_info "访问: http://localhost:3002"
                print_info "健康检查: http://localhost:3002/health"
                print_info "前端: 打开 client/pro-dashboard.html"

                # 等待服务启动
                print_info "等待服务初始化..."
                sleep 5

                # 健康检查
                print_info "执行健康检查..."
                if curl -s http://localhost:3002/health > /dev/null 2>&1; then
                    print_success "服务健康检查通过！"
                    echo ""
                    echo "📊 健康状态："
                    curl -s http://localhost:3002/health | jq . 2>/dev/null || curl -s http://localhost:3002/health
                else
                    print_warning "健康检查未通过，请查看日志"
                fi
                ;;

            4)
                print_header "启动所有服务"

                # Sniper
                print_info "启动 Sniper..."
                nohup npm start > logs/sniper.log 2>&1 &
                echo $! > sniper.pid
                print_success "Sniper 已启动"

                # Arbitrage Server
                print_info "启动 Arbitrage Server..."
                check_port 3002
                nohup npm run arbitrage > logs/arbitrage.log 2>&1 &
                echo $! > arbitrage.pid
                print_success "Arbitrage Server 已启动"

                # 4. 前端文件服务器 (端口 8080)
                print_info "启动前端文件服务器..."
                check_port 8080
                cd client
                nohup python3 -m http.server 8080 > ../logs/frontend.log 2>&1 &
                echo $! > ../frontend.pid
                cd ..
                print_success "前端文件服务器已启动"

                # 等待服务启动
                print_info "等待服务初始化..."
                sleep 5

                # 健康检查
                print_info "执行健康检查..."
                if curl -s http://localhost:3002/api/status > /dev/null 2>&1; then
                    print_success "所有服务启动成功！"
                else
                    print_warning "部分服务可能未正常启动，请查看日志"
                fi
                ;;

            0)
                print_info "退出"
                exit 0
                ;;

            *)
                print_error "无效选项"
                exit 1
                ;;
        esac
    fi

    # 9. 显示服务信息
    print_header "服务信息"

    echo -e "${GREEN}🎉 VibeCurve 服务已启动！${NC}\n"

    echo "📡 服务端点："

    if [ -f arbitrage.pid ]; then
        echo "   - Arbitrage Server:  http://localhost:3002"
        echo "   - API Status:         http://localhost:3002/api/status"
    fi

    if [ -f web-server.pid ]; then
        echo "   - Web Socket Server: http://localhost:3001"
    fi

    if [ -f frontend.pid ]; then
        echo -e "${GREEN}   - 前端界面:          http://localhost:8080/pro-dashboard.html${NC}"
    fi

    if [ -f sniper.pid ]; then
        echo "   - Sniper:             运行中 (日志: tail -f logs/sniper.log)"
    fi

    echo ""
    echo "📝 常用命令："

    if [ -f sniper.pid ]; then
        echo "   Sniper 日志:       tail -f logs/sniper.log"
    fi

    if [ -f arbitrage.pid ]; then
        echo "   Arbitrage 日志:    tail -f logs/arbitrage.log"
    fi

    if [ -f web-server.pid ]; then
        echo "   Web Server 日志:   tail -f logs/web-server.log"
    fi

    if [ -f frontend.pid ]; then
        echo "   前端服务器日志:   tail -f logs/frontend.log"
    fi

    echo "   停止所有服务:     ./stop.sh"
    echo "   重启服务:        ./stop.sh && ./start.sh"
    echo "   运行测试:        cd tests && npm run test"
    echo ""

    # 特殊提示：如果有前端服务器
    if [ -f frontend.pid ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}🌐 在浏览器中打开: http://localhost:8080/pro-dashboard.html${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
    fi

    # 10. 实时日志（可选）
    if [ "$choice" = "local" ]; then
        echo "选择要查看的日志："
        [ -f sniper.pid ] && echo "  1) Sniper"
        [ -f web-server.pid ] && echo "  2) Web Socket Server"
        [ -f arbitrage.pid ] && echo "  3) Arbitrage Server"
        [ -f frontend.pid ] && echo "  4) 前端服务器"
        echo "  0) 退出"
        echo ""
        read -p "请输入选项: " log_choice

        case $log_choice in
            1)
                [ -f sniper.pid ] && tail -f logs/sniper.log
                ;;
            2)
                [ -f web-server.pid ] && tail -f logs/web-server.log
                ;;
            3)
                [ -f arbitrage.pid ] && tail -f logs/arbitrage.log
                ;;
            4)
                [ -f frontend.pid ] && tail -f logs/frontend.log
                ;;
            0)
                print_info "退出"
                ;;
            *)
                print_error "无效选项"
                ;;
        esac
    elif [ "$choice" = "docker" ]; then
        read -p "是否查看实时日志？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose logs -f vibecurve
        fi
    fi
}

# 运行主函数
main
