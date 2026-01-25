import dotenv from 'dotenv';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

dotenv.config();

export async function sendTgAlert(message: string) {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  
  // 自动读取系统或 .env 中的代理配置
  const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;

  if (!token || !chatId) return; //以此静默失败，不打扰主流程，除非调试

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const config: any = {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 // 10秒超时
    };

    // 挂载代理
    if (proxyUrl) {
        const agent = new HttpsProxyAgent(proxyUrl);
        config.httpsAgent = agent;
        config.proxy = false; 
    }

    const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
    };

    await axios.post(url, payload, config);
    // 成功不打印日志，以免干扰 Dashboard

  } catch (e: any) {
    // 仅在严重错误时打印
    if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
        // console.error(`❌ TG Network Error (Check Proxy)`);
    }
  }
}