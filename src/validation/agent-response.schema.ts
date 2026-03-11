import { z } from 'zod';

export const AgentResponseSchema = z.object({
    answer: z.string().min(1, 'answer must not be empty'),
    choice: z.enum(['A', 'B', 'C', 'D']).nullable(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/**
 * Parse and validate a raw agent JSON string.
 * Returns { success: true, data } or { success: false, error }.
 */
export function parseAgentResponse(raw: string):
    | { success: true; data: AgentResponse }
    | { success: false; error: string } {
    try {
        // Strip markdown code fences if the model wrapped JSON in ```
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        const result = AgentResponseSchema.safeParse(parsed);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return { success: false, error: result.error.issues.map((i) => i.message).join('; ') };
    } catch (e: any) {
        return { success: false, error: `JSON parse failed: ${e.message}` };
    }
}
