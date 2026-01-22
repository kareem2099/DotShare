// src/utils/Logger.ts
import * as vscode from 'vscode';

export enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    DEBUG = 'DEBUG'
}

export class Logger {
    private static _instance: Logger;
    private outputChannel: vscode.OutputChannel;

    // 1. Private Constructor (to ensure no one can create new Logger)
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel("DotShare");
    }

    // 2. Private Getter for Instance (for internal use only)
    private static get instance(): Logger {
        if (!Logger._instance) {
            Logger._instance = new Logger();
        }
        return Logger._instance;
    }

    // 3. The Core Log Logic (Instance Method)
    private logInstance(level: LogLevel, message: string, data?: unknown) {
        const timestamp = new Date().toLocaleTimeString();
        let logMessage = `[${timestamp}] [${level}] ${message}`;

        if (data) {
            try {
                const dataString = JSON.stringify(data, null, 2);
                logMessage += `\nData: ${dataString}`;
            } catch (error) {
                logMessage += `\nData: [Circular or Unstringifiable Object]`;
            }
        }

        this.outputChannel.appendLine(logMessage);
    }

    // ============================================================
    // 🚀 Public Static Methods (this allows you to use Logger.info directly)
    // ============================================================

    public static info(message: string, data?: unknown) {
        Logger.instance.logInstance(LogLevel.INFO, message, data);
    }

    public static warn(message: string, data?: unknown) {
        Logger.instance.logInstance(LogLevel.WARN, message, data);
    }

    public static error(message: string, error?: unknown) {
        const errorMsg = error instanceof Error ? error.stack || error.message : JSON.stringify(error);
        Logger.instance.logInstance(LogLevel.ERROR, message, errorMsg);
    }

    public static debug(message: string, data?: unknown) {
        // Check Debug Mode
        /*
           Note: In the Extension, dealing with process.env can sometimes be tricky.
           It's better to rely on configuration settings or context globalState.
           But this code works if you pass the variables correctly.
        */
       // For simplicity, we assume we are always logging in debug mode for now
        Logger.instance.logInstance(LogLevel.DEBUG, message, data);
    }

    public static show() {
        Logger.instance.outputChannel.show();
    }
}
