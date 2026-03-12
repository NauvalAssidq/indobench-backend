export interface ModelResponse {
    text: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ModelAdapter {
    /**
     * Send a prompt to the model and return the text response along with token usage.
     * @param systemPrompt  Instructions / persona for the model
     * @param userPrompt    The actual question / task
     */
    call(systemPrompt: string, userPrompt: string): Promise<ModelResponse>;
}
