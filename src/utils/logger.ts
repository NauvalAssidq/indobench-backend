type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export class Logger {
    constructor(private readonly context: string) { }

    info(message: string, meta?: Record<string, unknown>) {
        this.log('INFO', message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>) {
        this.log('WARN', message, meta);
    }

    error(message: string, meta?: Record<string, unknown>) {
        this.log('ERROR', message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>) {
        this.log('DEBUG', message, meta);
    }

    private log(level: Level, message: string, meta?: Record<string, unknown>) {
        const entry = {
            ts: new Date().toISOString(),
            level,
            context: this.context,
            message,
            ...meta,
        };
        const output = JSON.stringify(entry);
        if (level === 'ERROR' || level === 'WARN') {
            console.error(output);
        } else {
            console.log(output);
        }
    }
}
