/**
 * 测试运行器 - 运行所有测试并生成报告
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// 测试模块
import { runUnitTests } from './unit.test';
import { runIntegrationTests } from './integration.test';
import { runPerformanceTests } from './performance.test';
import { runSimulationTests } from './simulation.test';

interface TestReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    overallSuccessRate: number;
  };
  suites: any[];
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         VibeCurve 套利系统 - 完整测试套件                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('开始时间:', new Date().toISOString());
  console.log('环境:', process.version);
  console.log('');

  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    summary: {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      overallSuccessRate: 0
    },
    suites: []
  };

  try {
    // 1. 单元测试
    console.log('📋 阶段 1/4: 单元测试...');
    const unitResult = await runUnitTests();
    results.suites.push(unitResult);
    console.log('');

    // 2. 集成测试
    console.log('📋 阶段 2/4: 集成测试...');
    const integrationResult = await runIntegrationTests();
    results.suites.push(integrationResult);
    console.log('');

    // 3. 性能测试
    console.log('📋 阶段 3/4: 性能测试...');
    const performanceResult = await runPerformanceTests();
    results.suites.push(performanceResult);
    console.log('');

    // 4. 模拟测试
    console.log('📋 阶段 4/4: 模拟测试...');
    const simulationResult = await runSimulationTests();
    results.suites.push(simulationResult);
    console.log('');

    // 计算总体统计
    results.suites.forEach(suite => {
      results.summary.totalTests += suite.summary.total;
      results.summary.passed += suite.summary.passed;
      results.summary.failed += suite.summary.failed;
      results.summary.skipped += suite.summary.skipped;
    });

    results.summary.overallSuccessRate = results.summary.passed / (results.summary.totalTests - results.summary.skipped);

    // 生成详细报告
    generateReport(results);

  } catch (error) {
    console.error('\n❌ 测试运行失败:', error);
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    测试完成                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

/**
 * 生成测试报告
 */
function generateReport(results: TestReport): void {
  // 确保测试目录存在
  const testDir = join(process.cwd(), 'tests', 'reports');
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const reportPath = join(testDir, `test-report-${Date.now()}.json`);
  const mdReportPath = join(testDir, `test-report-${Date.now()}.md`);

  // JSON 报告
  writeFileSync(reportPath, JSON.stringify(results, null, 2));

  // Markdown 报告
  let md = `# VibeCurve 套利系统 - 测试报告

## 执行信息

- **测试时间**: ${results.timestamp}
- **Node 版本**: ${results.environment.nodeVersion}
- **平台**: ${results.environment.platform}
- **架构**: ${results.environment.arch}

## 总体结果

| 指标 | 数值 |
|------|------|
| 总测试数 | ${results.summary.totalTests} |
| 通过 | ${results.summary.passed} |
| 失败 | ${results.summary.failed} |
| 跳过 | ${results.summary.skipped} |
| 成功率 | ${(results.summary.overallSuccessRate * 100).toFixed(1)}% |

`;

  // 添加各个测试套件的详情
  results.suites.forEach((suite: any) => {
    md += `\n## ${suite.suite}

`;
    md += `- 总测试: ${suite.summary.total}\n`;
    md += `- 通过: ${suite.summary.passed}\n`;
    md += `- 失败: ${suite.summary.failed}\n`;
    md += `- 跳过: ${suite.summary.skipped}\n`;
    md += `- 成功率: ${((suite.summary.passed / (suite.summary.total - suite.summary.skipped)) * 100).toFixed(1)}%\n\n`;

    // 失败的测试
    const failedTests = suite.tests.filter((t: any) => t.status === 'FAIL');
    if (failedTests.length > 0) {
      md += `### 失败的测试\n\n`;
      failedTests.forEach((test: any) => {
        md += `#### ${test.name}\n`;
        md += `**错误**: ${test.error}\n`;
        md += `**耗时**: ${test.duration}ms\n\n`;
      });
    }

    // 性能数据
    if (suite.suite === 'Performance Tests') {
      md += `### 性能指标\n\n`;
      const perfTests = suite.tests.filter((t: any) => t.status === 'PASS');
      perfTests.forEach((test: any) => {
        if (test.details) {
          md += `- **${test.name}**: `;
          if (typeof test.details === 'number') {
            md += `${test.details}ms\n`;
          } else {
            md += `\n${JSON.stringify(test.details, null, 2)}\n`;
          }
        }
      });
      md += '\n';
    }
  });

  // 添加评估和建议
  md += `## 评估和建议\n\n`;

  // 检查是否可以进入实盘
  const canProceedToProduction = results.summary.overallSuccessRate >= 0.8 && results.summary.failed === 0;

  md += `## 实盘测试检查清单\n\n`;

  const checklist = [
    { task: '所有单元测试通过', done: results.suites[0].summary.failed === 0 },
    { task: '所有集成测试通过', done: results.suites[1].summary.failed === 0 },
    { task: '性能测试达标', done: results.suites[2].summary.failed === 0 },
    { task: '模拟测试运行稳定', done: results.suites[3].summary.failed === 0 },
    { task: '整体成功率 >= 80%', done: results.summary.overallSuccessRate >= 0.8 }
  ];

  checklist.forEach(item => {

  if (results.summary.overallSuccessRate >= 0.9) {
    md += `✅ **优秀**: 系统表现优异，所有核心功能正常工作。\n\n`;
    md += `建议: 可以进入小额实盘测试阶段（0.01 SOL）。\n\n`;
  } else if (results.summary.overallSuccessRate >= 0.7) {
    md += `⚠️  **良好**: 系统基本正常，但有部分测试失败。\n\n`;
    md += `建议: 修复失败的测试后，再考虑实盘测试。\n\n`;
  } else if (results.summary.overallSuccessRate >= 0.5) {
    md += `⚠️  **一般**: 部分核心功能存在问题。\n\n`;
    md += `建议: 优先修复失败的测试，确保基本功能正常。\n\n`;
  } else {
    md += `❌ **不合格**: 系统存在严重问题。\n\n`;
    md += `建议: 暂停实盘计划，修复所有问题后再测试。\n\n`;
  }

  // 检查是否可以进入实盘
  const canProceedToProduction = results.summary.overallSuccessRate >= 0.8 && results.summary.failed === 0;

  md += `## 实盘测试检查清单\n\n`;

  const checklist = [
    { task: '所有单元测试通过', done: results.suites[0].summary.failed === 0 },
    { task: '所有集成测试通过', done: results.suites[1].summary.failed === 0 },
    { task: '性能测试达标', done: results.suites[2].summary.failed === 0 },
    { task: '模拟测试运行稳定', done: results.suites[3].summary.failed === 0 },
    { task: '整体成功率 >= 80%', done: results.summary.overallSuccessRate >= 0.8 }
  ];

  checklist.forEach(item => {
    const status = item.done ? '✅' : '❌';
    md += `${status} ${item.task}\n`;
  });

  md += `\n`;

  if (canProceedToProduction) {
    md += `## ✅ 实盘测试准备就绪\n\n`;
    md += `恭喜！所有测试通过，系统可以进入实盘测试阶段。\n\n`;
    md += `**下一步操作**:\n`;
    md += `1. 运行 \`npx ts-node src/dashboard-arbitrage.ts\` 启动监控\n`;
    md += `2. 按 SPACE 启动自动套利\n`;
    md += `3. 观察半小时，确认系统稳定\n`;
    md += `4. 按 M 切换到真实模式\n`;
    md += `5. 从 0.01 SOL 开始小额测试\n\n`;
  } else {
    md += `## ⚠️ 暂缓实盘测试\n\n`;
    md += `当前状态不建议进入实盘测试。请:\n\n`;
    md += `1. 修复失败的测试\n`;
    md += `2. 提高测试通过率到 80% 以上\n`;
    md += `3. 确保所有核心功能正常\n`;
    md += `4. 重新测试\n\n`;
  }

  // 添加时间戳和版本
  md += `---\n\n`;
  md += `**报告生成时间**: ${new Date().toISOString()}\n`;
  md += `**报告版本**: v1.0\n`;
  md += `**测试框架**: VibeCurve Test Runner\n`;

  writeFileSync(mdReportPath, md);

  console.log('\n📄 测试报告已生成:');
  console.log(`   JSON: ${reportPath}`);
  console.log(`   Markdown: ${mdReportPath}`);
}

// 主函数
async function main() {
  try {
    await runAllTests();
  } catch (error) {
    console.error('测试运行失败:', error);
    process.exit(1);
  }
}

// 启动测试
main();
