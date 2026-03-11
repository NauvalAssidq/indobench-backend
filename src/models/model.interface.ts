export interface ModelAdapter {
    /**
     * Send a prompt to the model and return the raw text response.
     * @param systemPrompt  Instructions / persona for the model
     * @param userPrompt    The actual question / task
     */
    call(systemPrompt: string, userPrompt: string): Promise<string>;
}
