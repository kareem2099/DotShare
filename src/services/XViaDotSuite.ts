import type * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DotShareAuth } from './DotShareAuth';
import { SchedulerClient } from './SchedulerClient';
import { secureFetch } from '../security/http';

/**
 * X connected through DotSuite: the X token stays on the DotSuite server, and
 * posts go through the DotSuite API, which charges them to the plan's monthly X
 * budget (DotSuite pays X per post). Set when the X sign-in returns `via=dotsuite`.
 */
export const X_VIA_KEY = 'dotshare.xVia';

export function isXViaDotSuite(context: vscode.ExtensionContext): boolean {
    return context.globalState.get<string>(X_VIA_KEY) === 'dotsuite';
}

export interface XPart { text: string; media?: string[] }
export interface XPublishResult { urls: string[]; chargedMicros: number; remainingMicros: number; status: string }

const usd = (micros: number): string => `$${(micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : 3)}`;
export const formatXCharge = (r: XPublishResult): string => `X charged ${usd(r.chargedMicros)} · ${usd(r.remainingMicros)} left this month`;

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

/** Publishes a post or thread to X through DotSuite. Throws with a readable message. */
export async function publishXViaDotSuite(context: vscode.ExtensionContext, parts: XPart[]): Promise<XPublishResult> {
    if (!await DotShareAuth.getToken(context)) {
        throw new Error('X is connected through your DotSuite account. Sign in to DotSuite in DotShare\'s Settings to post to X.');
    }
    const posts = [];
    for (const part of parts) {
        const mediaUrls: string[] = [];
        for (const file of part.media || []) {
            const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
            if (!type) throw new Error('X posts through DotSuite support PNG, JPEG, WebP and GIF images. Videos are not supported yet.');
            const upload = await SchedulerClient.uploadMediaBase64(context, path.basename(file), fs.readFileSync(file).toString('base64'), type);
            if (!upload.success || !upload.url) throw new Error(upload.message || 'Image upload to DotSuite failed.');
            mediaUrls.push(upload.url);
        }
        posts.push({ text: part.text, media_urls: mediaUrls });
    }
    const response = await secureFetch(`${DotShareAuth.getApiBaseUrl()}/v1/x/posts`, {
        method: 'POST',
        headers: await DotShareAuth.buildHeaders(context),
        // One ID per click: DotSuite never posts or charges the same request twice.
        body: JSON.stringify({ request_id: `vscode-${randomUUID()}`, posts }),
    });
    const data = await response.json().catch(() => ({})) as {
        error?: string; status?: string; charged_micros?: number;
        posts?: { url?: string; error?: string; status: string }[]; usage?: { remaining_micros?: number };
    };
    if (!response.ok) throw new Error(data.error || `DotSuite couldn't post to X (${response.status}).`);
    const failed = data.posts?.find(post => post.status !== 'published');
    if (data.status !== 'published') {
        throw new Error(failed?.status === 'uncertain'
            ? `X didn't confirm one of the posts. Check your X account before posting again. ${failed.error || ''}`.trim()
            : failed?.error || 'X rejected the post.');
    }
    return {
        status: data.status,
        urls: (data.posts || []).map(post => post.url).filter((url): url is string => !!url),
        chargedMicros: data.charged_micros || 0,
        remainingMicros: data.usage?.remaining_micros || 0,
    };
}
