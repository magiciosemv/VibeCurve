import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Terminal, Activity, BrainCircuit, ShieldAlert } from 'lucide-react';

// 连接后端
const socket = io('http://localhost:3001');

interface Tx {
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  hash: string;
  timestamp: string;
}

function App() {
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [logs, setLogs] = useState<Tx[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [aiAnalysis, setAiAnalysis] = useState("Connecting to Neural Net...");
  const [status, setStatus] = useState("IDLE");
  const [globalLogs, setGlobalLogs] = useState<string[]>([]);
  
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 监听初始化数据
    socket.on('init-data', (data) => {
      setPriceHistory(data.history);
      setCurrentPrice(data.price);
      setAiAnalysis(data.ai);
    });

    // 监听价格更新
    socket.on('price-update', (data) => {
      setCurrentPrice(data.price);
      setStatus(data.status);
      setPriceHistory(prev => {
        const newHistory = [...prev, { time: data.time, price: data.price }];
        if (newHistory.length > 50) newHistory.shift();
        return newHistory;
      });
    });

    // 监听新交易
    socket.on('new-tx', (tx: Tx) => {
      setLogs(prev => [tx, ...prev].slice(0, 50));
    });

    // 监听 AI
    socket.on('ai-update', (msg: string) => {
      setAiAnalysis(msg);
    });
    
    // 监听全网扫描
    socket.on('global-scan', (data: any) => {
        setGlobalLogs(prev => [data.message, ...prev].slice(0, 10));
    });

    return () => { socket.off(); };
  }, []);

  return (
    <div className="min-h-screen p-6 bg-black text-green-500 selection:bg-green-900">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-green-800 pb-4">
        <div className="flex items-center gap-3">
          <Terminal className="w-8 h-8" />
          <h1 className="text-3xl font-bold tracking-tighter">VIBE CURVE <span className="text-xs border border-green-500 px-1 rounded">PRO</span></h1>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            RPC: ONLINE
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            JITO: ACTIVE
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6 h-[80vh]">
        
        {/* Left Column: Chart & Feed */}
        <div className="col-span-8 flex flex-col gap-6">
          
          {/* Price Chart */}
          <div className="h-1/2 border border-green-900 bg-gray-900/20 p-4 rounded-lg relative">
            <div className="absolute top-4 left-4 z-10">
                <h3 className="text-xl font-bold text-white">{currentPrice.toFixed(8)} SOL</h3>
                <p className="text-xs text-gray-400">TARGET: CHILL GUY</p>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceHistory}>
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#000', border: '1px solid #0f0' }}
                    itemStyle={{ color: '#0f0' }}
                />
                <Line type="monotone" dataKey="price" stroke="#00ff41" strokeWidth={2} dot={false} animationDuration={300} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Transaction Logs */}
          <div className="h-1/2 border border-green-900 bg-gray-900/20 p-4 rounded-lg overflow-hidden flex flex-col">
            <h3 className="flex items-center gap-2 border-b border-green-900 pb-2 mb-2">
                <Activity size={16} /> LIVE FEED
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1 font-mono text-sm scrollbar-hide">
              {logs.map((log, i) => (
                <div key={i} className={`flex justify-between ${log.type === 'buy' ? 'text-green-400' : 'text-red-500'}`}>
                  <span>[{log.type.toUpperCase()}] {log.amount.toLocaleString()} Tokens</span>
                  <span className="opacity-50">{log.hash.slice(0, 8)}...</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        {/* Right Column: AI & Strategy */}
        <div className="col-span-4 flex flex-col gap-6">
          
          {/* AI Brain */}
          <div className="border border-purple-500/30 bg-purple-900/10 p-6 rounded-lg">
            <h3 className="flex items-center gap-2 text-purple-400 mb-4 font-bold">
                <BrainCircuit /> AI SENTIMENT ANALYSIS
            </h3>
            <div className="text-lg leading-relaxed text-white animate-fade-in">
              "{aiAnalysis}"
            </div>
          </div>

          {/* Strategy Status */}
          <div className="border border-blue-500/30 bg-blue-900/10 p-6 rounded-lg flex-1">
             <h3 className="flex items-center gap-2 text-blue-400 mb-4 font-bold">
                <ShieldAlert /> STRATEGY ENGINE
            </h3>
            <div className="space-y-4">
                <div>
                    <p className="text-xs text-gray-500">STATUS</p>
                    <p className="text-xl">{status}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">PNL VELOCITY</p>
                    <p className="text-xl text-green-400">+12.5% / hr</p>
                </div>
            </div>
          </div>

          {/* Global Scanner */}
          <div className="border border-yellow-500/30 bg-yellow-900/10 p-4 rounded-lg h-1/3 overflow-hidden">
             <h3 className="text-yellow-500 text-xs mb-2">🌍 GLOBAL NEW LAUNCHES</h3>
             <div className="space-y-1 text-xs text-yellow-200/80">
                {globalLogs.map((log, i) => (
                    <div key={i} className="truncate">{log}</div>
                ))}
             </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default App