import dotenv from 'dotenv';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

dotenv.config();

// 🛑 本地专业术语库 (当 API 连不上时的兜底方案)
const LOCAL_ROASTS = {
  pump: [
    "📈 监测到资金净流入显著，多头动量指标（Momentum）确认突破。",
    "🚀 链上交易量激增，当前价格已突破短期均线压制。",
    "📊 买单密度增加，流动性池深度正在快速构建。",
    "💹 聪明钱（Smart Money）地址出现吸筹迹象，趋势看涨。",
    "📈 量价齐升，当前技术形态呈现典型的上升通道。"
  ],
  dump: [
    "📉 监测到大额抛压，短期支撑位已失效，建议风控。",
    "⚠️ 获利盘开始离场，流动性出现局部枯竭迹象。",
    "🩸 卖方力量主导市场，RSI 指标显示超买回调风险。",
    "📉 巨鲸地址（Whale）正在减仓，市场情绪转为谨慎。",
    "🛑 价格跌破关键心理关口，建议执行止损策略。"
  ],
  intro: [
    "🤖 市场环境扫描完成。当前资产波动率处于高位，建议关注流动性变化。",
    "🤖 系统初始化完毕。正在监控链上 Alpha 信号与异常资金流向。",
    "🤖 目标资产锁定。正在实时计算联合曲线（Bonding Curve）斜率。"
  ]
};

// 获取本地评论
export function getLocalRoast(type: 'pump' | 'dump' | 'intro'): string {
  const list = LOCAL_ROASTS[type];
  return "🤖 [本地] " + list[Math.floor(Math.random() * list.length)];
}

export async function getAiComment(context: 'pump' | 'dump' | 'intro', tokenName: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;

  // 如果没 Key，使用本地专业库
  if (!apiKey) return getLocalRoast(context);

  try {
    const config: any = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 5000 
    };

    if (proxyUrl) {
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.proxy = false;
    }

    // ⚡️ 核心：专业分析师 Prompt
    let userPrompt = "";
    if (context === 'intro') {
        userPrompt = `请用简短、专业的金融术语评价代币 "${tokenName}" 的开盘表现。20字以内。`;
    } else if (context === 'pump') {
        userPrompt = `代币 "${tokenName}" 价格正在快速拉升。请从技术面或资金面进行简短点评（如：突破阻力、量能配合）。20字以内。`;
    } else {
        userPrompt = `代币 "${tokenName}" 价格正在下跌。请给出风险提示（如：获利回吐、破位）。20字以内。`;
    }

    const payload = {
      model: "deepseek-chat", // 兼容 OpenAI gpt-3.5-turbo
      messages: [
        { 
            role: "system", 
            content: "你是一位资深的加密货币高频交易分析师。你的语言风格冷静、专业、客观。请使用简体中文输出。禁止使用网络俚语。" 
        },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7 // 降低随机性，增加严谨度
    };

    const response = await axios.post(apiUrl, payload, config);
    return `🤖 ${response.data.choices[0].message.content.trim()}`;

  } catch (e) {
    return getLocalRoast(context);
  }
}