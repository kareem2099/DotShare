export class GenerationError extends Error {
    public constructor(message: string, public readonly retryWithMoreTokens = false) {
        super(message);
        this.name = 'GenerationError';
    }
}

export function requireGeneratedText(text: string | undefined | null): string {
    const content = text?.trim();
    if (!content) throw new GenerationError('The AI provider returned no article text. Try again or select another model.');
    return content;
}
