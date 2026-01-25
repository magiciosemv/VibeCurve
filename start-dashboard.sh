#!/bin/bash

# Trading & Strategy Bots - Professional Dashboard Launcher

echo "=============================================="
echo "Trading & Strategy Bots"
echo "Professional Analytics Dashboard"
echo "=============================================="
echo ""

# Kill any existing processes
echo "Stopping any existing servers..."
pkill -f "arbitrage-server" 2>/dev/null
pkill -f "http.server" 2>/dev/null
sleep 2

# Start the backend server
echo "Starting backend server..."
npx ts-node src/arbitrage-server.ts &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to initialize..."
sleep 5

# Check if server started successfully
if curl -s http://localhost:3002/api/status > /dev/null 2>&1; then
    echo "Backend server started successfully (PID: $SERVER_PID)"
else
    echo "Warning: Backend server may not have started correctly"
fi

# Start the HTTP server for frontend
echo ""
echo "Starting HTTP server for frontend..."
cd /home/magic/VibeCurve/client
python3 -m http.server 8080 > /dev/null 2>&1 &
HTTP_PID=$!

echo ""
echo "=============================================="
echo "Dashboard is now ready!"
echo "=============================================="
echo ""
echo "Open your browser and navigate to:"
echo ""
echo "  http://localhost:8080/pro-dashboard.html"
echo ""
echo "API Endpoints:"
echo "  Backend:  http://localhost:3002"
echo "  Frontend: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "=============================================="
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $SERVER_PID 2>/dev/null
    kill $HTTP_PID 2>/dev/null
    echo "Servers stopped. Goodbye!"
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Keep script running
wait
