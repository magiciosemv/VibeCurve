/**
 * 结构化日志系统
 * 提供统一的日志格式、级别控制和输出管理
 */

import fs from 'fs';
import path from 'path';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  data?: any;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  level: LogLevel;
  context: string;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableJson: boolean;
}

/**
 * 日志器类
 */
export class Logger {
  private config: LoggerConfig;
  private fileStream?: fs.WriteStream;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      context: 'App',
      enableConsole: true,
      enableFile: false,
      enableJson: false,
      ...config
    };

    if (this.config.enableFile && this.config.filePath) {
      this.initFileStream();
    }
  }

  /**
   * 初始化文件流
   */
  private initFileStream() {
    if (!this.config.filePath) return;

    const dir = path.dirname(this.config.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.fileStream = fs.createWriteStream(this.config.filePath, { flags: 'a' });
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: any, error?: Error) {
    if (level < this.config.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      context: this.config.context,
      message,
      data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    const output = this.config.enableJson
      ? JSON.stringify(entry)
      : this.formatLogEntry(entry);

    if (this.config.enableConsole) {
      const color = this.getConsoleColor(level);
      const reset = '\x1b[0m';
      console.log(`${color}${output}${reset}`);
    }

    if (this.fileStream) {
      this.fileStream.write(output + '\n');
    }
  }

  /**
   * 格式化日志条目
   */
  private formatLogEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level}]`,
      `[${entry.context}]`,
      entry.message
    ];

    if (entry.data) {
      parts.push(`\n  Data: ${JSON.stringify(entry.data, null, 2)}`);
    }

    if (entry.error) {
      parts.push(`\n  Error: ${entry.error.name}: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n  Stack: ${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * 获取控制台颜色
   */
  private getConsoleColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '\x1b[90m'; // 灰色
      case LogLevel.INFO:  return '\x1b[36m'; // 青色
      case LogLevel.WARN:  return '\x1b[33m'; // 黄色
      case LogLevel.ERROR: return '\x1b[31m'; // 红色
      case LogLevel.FATAL: return '\x1b[35m'; // 紫色
      default:             return '\x1b[0m';
    }
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * INFO 级别日志
   */
  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, error?: Error, data?: any) {
    this.log(LogLevel.ERROR, message, data, error);
  }

  /**
   * FATAL 级别日志
   */
  fatal(message: string, error?: Error, data?: any) {
    this.log(LogLevel.FATAL, message, data, error);
  }

  /**
   * 关闭日志器
   */
  close() {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

/**
 * 创建子日志器
 */
export function createLogger(context: string, level?: LogLevel): Logger {
  return new Logger({
    context,
    level: level || LogLevel.INFO,
    enableConsole: true,
    enableFile: process.env.NODE_ENV === 'production',
    filePath: './logs/app.log',
    enableJson: process.env.NODE_ENV === 'production'
  });
}

// 全局日志器实例
export const globalLogger = createLogger('Global');

// 便捷函数
export const log = {
  debug: (message: string, data?: any) => globalLogger.debug(message, data),
  info: (message: string, data?: any) => globalLogger.info(message, data),
  warn: (message: string, data?: any) => globalLogger.warn(message, data),
  error: (message: string, error?: Error, data?: any) => globalLogger.error(message, error, data),
  fatal: (message: string, error?: Error, data?: any) => globalLogger.fatal(message, error, data)
};
