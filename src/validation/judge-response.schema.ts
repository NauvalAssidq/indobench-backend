import { z } from 'zod';

export const JudgeResponseSchema = z.object({
    score: z.number().min(0).max(1),
    reason: z.string().min(1),
});

export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

/**
 * Parse and validate a raw judge JSON string.
 * Returns { success: true, data } or { success: false, error }.
 */
export function parseJudgeResponse(raw: string):
    | { success: true; data: JudgeResponse }
    | { success: false; error: string } {
    try {
        let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
            cleaned = cleaned.substring(startIdx, endIdx + 1);
        }
        const parsed = JSON.parse(cleaned);

        if (typeof parsed.score === 'number' && parsed.score > 1) {
            parsed.score = parsed.score / 5;
        }

        const result = JudgeResponseSchema.safeParse(parsed);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return { success: false, error: result.error.issues.map((i) => i.message).join('; ') };
    } catch (e: any) {
        return { success: false, error: `JSON parse failed: ${e.message}` };
    }
}
