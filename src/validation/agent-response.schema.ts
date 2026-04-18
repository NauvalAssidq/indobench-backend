import { z } from 'zod';

export const AgentResponseSchema = z.object({
    thinking: z.string().optional(),
    answer: z.string().min(1, 'answer must not be empty'),
    choice: z.enum(['A', 'B', 'C', 'D']).nullable(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export function parseAgentResponse(raw: string):
    | { success: true; data: AgentResponse }
    | { success: false; error: string } {
    try {
        let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
            cleaned = cleaned.substring(startIdx, endIdx + 1);
        }
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
