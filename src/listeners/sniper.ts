import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';

const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump'); 

export async function startSniperListener(connection: Connection) {
  console.log(`🎯 SNIPER MODE: SINGLE FIRE (Free Tier Friendly)`);
  console.log(`🔭 Target: ${TARGET_MINT.toBase58()}`);
  
  let lastSignature: string | null = null;
  
  const poll = async () => {
    try {
      // 1. 获取签名列表
      const signatures = await connection.getSignaturesForAddress(
        TARGET_MINT,
        { limit: 5 },
        'confirmed'
      );

      if (signatures.length === 0) return;

      const newestTx = signatures[0];

      if (!lastSignature) {
        lastSignature = newestTx.signature;
        console.log(`✅ Monitoring started. Waiting...`);
        return;
      }

      if (newestTx.signature === lastSignature) {
        process.stdout.write('.');
        return;
      }

      // === 2. 发现新签名 ===
      const newSigs = [];
      for (const tx of signatures) {
        if (tx.signature === lastSignature) break;
        newSigs.push(tx.signature);
      }
      
      lastSignature = newestTx.signature;
      
      console.log(`\n🔍 Found ${newSigs.length} new txs. Fetching details one by one...`);

      // 3. 🚨 修复点：一个一个查，避开 Batch Limit 🚨
      for (const sig of newSigs) {
        try {
            // 使用 getParsedTransaction (单数形式)
            const tx = await connection.getParsedTransaction(sig, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

            if (tx) {
                analyzeTransaction(tx, sig);
            }
        } catch (innerErr) {
            console.log(`   ⚠️ Skipped ${sig.slice(0,8)}...`);
        }
      }

    } catch (err) {
      console.error("\n❌ DEBUG ERROR:", err);
    }
  };

  setInterval(poll, 3000);
}

function analyzeTransaction(tx: ParsedTransactionWithMeta, signature: string) {
  if (tx.meta?.err) {
    console.log(`   ❌ Failed Tx: ${signature.slice(0, 10)}...`);
    return;
  }

  const preBalances = tx.meta?.preTokenBalances || [];
  const postBalances = tx.meta?.postTokenBalances || [];

  let maxChange = 0;

  for (const post of postBalances) {
    if (post.mint !== TARGET_MINT.toBase58()) continue;

    const pre = preBalances.find(p => p.accountIndex === post.accountIndex);
    const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || "0") : 0;
    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || "0");
    const change = postAmount - preAmount;

    if (Math.abs(change) > 0.1) {
        if (Math.abs(change) > Math.abs(maxChange)) {
            maxChange = change;
        }
    }
  }

  if (maxChange === 0) {
      // 很多时候是机器人套利交易，余额变动很复杂，暂时忽略
      return; 
  }

  const isBuy = maxChange > 0;
  const icon = isBuy ? "🟢 BUY " : "🔴 SELL";
  
  console.log(`   ${icon} | ${Math.abs(maxChange).toFixed(2)} Tokens`);
  console.log(`      🔗 https://solscan.io/tx/${signature}`);
}