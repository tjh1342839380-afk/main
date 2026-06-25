import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { appendFileSync, mkdirSync, readFileSync } from 'fs'
import { normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const DEBUG_LOG_FILE = './debug/api-proxy-requests.ndjson'
const DEBUG_BODY_LIMIT = 1024 * 1024
const DEBUG_SAFE_FIELD_KEYS = [
    'model',
    'size',
    'width',
    'height',
    'resolution',
    'image_size',
    'output_size',
    'aspect_ratio',
    'ratio',
    'image_ratio',
    'output_aspect_ratio',
    'aspectRatio',
    'output_ratio',
    'quality',
    'output_format',
    'output_compression',
    'moderation',
    'n',
    'stream',
    'partial_images',
    'response_format',
]

function loadDevProxyConfig() {
    try {
        return normalizeDevProxyConfig(
            JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
        )
    } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code === 'ENOENT') return null
        throw error
    }
}

function summarizeJsonRequest(rawBody: string) {
    try {
        const body = JSON.parse(rawBody) as Record<string, unknown>
        const summary: Record<string, unknown> = {}
        for (const key of DEBUG_SAFE_FIELD_KEYS) {
            if (key in body) summary[key] = body[key]
        }
        if (typeof body.prompt === 'string') summary.promptLength = body.prompt.length
        if (typeof body.input === 'string') summary.inputLength = body.input.length
        if (Array.isArray(body.tools)) summary.tools = body.tools
        return summary
    } catch {
        return { parseError: true, bodyLength: rawBody.length }
    }
}

function summarizeMultipartRequest(rawBody: string) {
    const summary: Record<string, unknown> = {}
    for (const key of DEBUG_SAFE_FIELD_KEYS) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const match = rawBody.match(new RegExp(`name="${escapedKey}"\\r?\\n\\r?\\n([^\\r\\n]*)`))
        if (match) summary[key] = match[1]
    }
    const fileMatches = rawBody.match(/filename="/g)
    if (fileMatches) summary.fileCount = fileMatches.length
    return Object.keys(summary).length ? summary : { bodyLength: rawBody.length }
}

function appendProxyDebugLog(entry: Record<string, unknown>) {
    try {
        mkdirSync('./debug', { recursive: true })
        appendFileSync(DEBUG_LOG_FILE, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`, 'utf-8')
    } catch {
        // Debug logging must never break the local proxy.
    }
}

function logProxyRequest(req: import('http').IncomingMessage, target: string) {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let truncated = false

    req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length
        if (totalBytes <= DEBUG_BODY_LIMIT) {
            chunks.push(Buffer.from(chunk))
        } else {
            truncated = true
        }
    })

    req.on('end', () => {
        const contentType = String(req.headers['content-type'] ?? '')
        const rawBody = Buffer.concat(chunks).toString('utf-8')
        const requestSummary = contentType.includes('application/json')
            ? summarizeJsonRequest(rawBody)
            : contentType.includes('multipart/form-data')
                ? summarizeMultipartRequest(rawBody)
                : { bodyLength: totalBytes, contentType }
        appendProxyDebugLog({
            type: 'request',
            method: req.method,
            path: req.url,
            target,
            contentType,
            bytes: totalBytes,
            truncated,
            body: requestSummary,
        })
    })
}

export default defineConfig(({ command }) => {
    const devProxyConfig = command === 'serve' && process.env.VITEST !== 'true' ? loadDevProxyConfig() : null

    return {
        plugins: [react()],
        base: './',
        define: {
            __APP_VERSION__: JSON.stringify(pkg.version),
            __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
        },
        server: {
            host: true,
            proxy:
                devProxyConfig?.enabled
                    ? {
                        [devProxyConfig.prefix]: {
                            target: devProxyConfig.target,
                            changeOrigin: devProxyConfig.changeOrigin,
                            secure: devProxyConfig.secure,
                            configure: (proxy) => {
                                proxy.on('proxyReq', (_proxyReq, req) => {
                                    logProxyRequest(req, devProxyConfig.target)
                                })
                                proxy.on('proxyRes', (proxyRes, req) => {
                                    appendProxyDebugLog({
                                        type: 'response',
                                        method: req.method,
                                        path: req.url,
                                        statusCode: proxyRes.statusCode,
                                        contentType: proxyRes.headers['content-type'],
                                    })
                                })
                            },
                            rewrite: (path) =>
                                path.replace(
                                    new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
                                    '',
                                ),
                        },
                    }
                    : undefined,
        },
    }
})
