import { jitoEngine } from './core/jito';

async function testJitoConnection() {
  console.log("🧪 Testing Jito Connection...");
  
  // 尝试获取客户端实例
  const client = jitoEngine.getClient();

  if (client) {
    console.log("🎉 SUCCESS: Jito Block Engine is reachable!");
    console.log("   We are ready to bribe validators.");
  } else {
    console.log("💀 FAILURE: Could not reach Jito.");
  }
  
  // 由于 jito-ts 底层是用 gRPC 连接的，我们得强制退出一下，否则进程挂起
  setTimeout(() => {
      console.log("👋 Test finished.");
      process.exit(0);
  }, 2000);
}

testJitoConnection();