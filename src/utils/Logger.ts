// src/utils/Logger.ts
import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO  = 1,
    WARN  = 2,
    ERROR = 3,
}

const LEVEL_LABEL: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]:  'INFO ',
    [LogLevel.WARN]:  'WARN ',
    [LogLevel.ERROR]: 'ERROR',
};

export class Logger {
    private static _instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private minLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DotShare');
    }

    private static get instance(): Logger {
        if (!Logger._instance) {
            Logger._instance = new Logger();
        }
        return Logger._instance;
    }

    /**
     * v3.0 — Call once at the top of activate().
     * Reads dotshare.logLevel from VS Code settings and watches for changes.
     * Safe to skip — defaults to INFO if not called.
     */
    public static init(context?: vscode.ExtensionContext): void {
        Logger.instance.refreshLevel();

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('dotshare.logLevel')) {
                Logger.instance.refreshLevel();
            }
        }, undefined, context?.subscriptions);
    }

    private refreshLevel(): void {
        const setting = vscode.workspace
            .getConfiguration('dotshare')
            .get<string>('logLevel', 'INFO')
            .toUpperCase();

        switch (setting) {
            case 'DEBUG': this.minLevel = LogLevel.DEBUG; break;
            case 'WARN':  this.minLevel = LogLevel.WARN;  break;
            case 'ERROR': this.minLevel = LogLevel.ERROR; break;
            default:      this.minLevel = LogLevel.INFO;  break;
        }
    }

    private logInstance(level: LogLevel, message: string, data?: unknown): void {
        if (level < this.minLevel) return;

        const timestamp = new Date().toLocaleTimeString();
        const label = LEVEL_LABEL[level];
        let logMessage = `[${timestamp}] [${label}] ${message}`;

        if (data !== undefined) {
            try {
                logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
            } catch {
                logMessage += `\nData: [Unstringifiable]`;
            }
        }

        this.outputChannel.appendLine(logMessage);
    }

    /** v3.0 — Print a section separator in the output channel */
    public static section(title: string): void {
        Logger.instance.outputChannel.appendLine(`\n${'─'.repeat(60)}`);
        Logger.instance.outputChannel.appendLine(`  ${title}`);
        Logger.instance.outputChannel.appendLine(`${'─'.repeat(60)}`);
    }

    // ── Public static API — identical to v2.x, no breaking changes ──

    public static info(message: string, data?: unknown): void {
        Logger.instance.logInstance(LogLevel.INFO, message, data);
    }

    public static warn(message: string, data?: unknown): void {
        Logger.instance.logInstance(LogLevel.WARN, message, data);
    }

    public static error(message: string, error?: unknown): void {
        const detail = error instanceof Error
            ? (error.stack ?? error.message)
            : error !== undefined ? JSON.stringify(error) : undefined;
        Logger.instance.logInstance(LogLevel.ERROR, message, detail);
    }

    public static debug(message: string, data?: unknown): void {
        Logger.instance.logInstance(LogLevel.DEBUG, message, data);
    }

    public static show(): void {
        Logger.instance.outputChannel.show();
    }
}