class WebviewLogger {
    constructor(scope = 'DotShare UI') {
        this.scope = scope;
        this.colors = {
            info: '#3498db',  // Blue
            warn: '#f39c12',  // Orange
            error: '#e74c3c', // Red
            success: '#2ecc71' // Green
        };
    }

    _format(level, message) {
        const timestamp = new Date().toLocaleTimeString();
        return [`%c[${this.scope}] %c[${timestamp}] %c${message}`,
                `color: ${this.colors[level]}; font-weight: bold;`,
                'color: gray;',
                'color: inherit;'];
    }

    info(message, data) {
        const args = this._format('info', message);
        if (data) {console.log(...args, data);}
        else {console.log(...args);}
    }

    warn(message, data) {
        const args = this._format('warn', message);
        if (data) {console.warn(...args, data);}
        else {console.warn(...args);}
    }

    error(message, error) {
        const args = this._format('error', message);
        if (error) {console.error(...args, error);}
        else {console.error(...args);}
    }

    success(message) {
         const args = this._format('success', message);
         console.log(...args);
    }

    debug(message, data) {
        // Only log debug messages if DEBUG_MODE is enabled
        if (this.isDebugMode()) {
            const args = this._format('info', message); // Use info color for debug
            if (data) {console.log(...args, data);}
            else {console.log(...args);}
        }
    }

    isDebugMode() {
        // Debug mode disabled for production to prevent console spam
        // Can be enabled by setting window.DEBUG_MODE = true in dev tools
        return (typeof window !== 'undefined' && window.DEBUG_MODE === true) ||
               (typeof process !== 'undefined' && process.env && process.env.DEBUG_MODE === 'true');
    }
}

// Create instance
const _instance = new WebviewLogger();

// Export static methods for cleaner usage
export const Logger = {
    info: (message, data) => _instance.info(message, data),
    warn: (message, data) => _instance.warn(message, data),
    error: (message, error) => _instance.error(message, error),
    success: (message) => _instance.success(message),
    debug: (message, data) => _instance.debug(message, data),
    show: () => {} // No-op for webview
};

// Export instance for backward compatibility
export const logger = _instance;

// ✅ Make Logger globally available on window for all JS files
if (typeof window !== 'undefined') {
    window.Logger = Logger;
    window.logger = logger;
}
