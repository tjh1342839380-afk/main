const DEFAULT_TARGET = 'https://sub2api.toioto.org/api/v1'
const MAX_BODY_BYTES = 1024 * 1024
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

type PagesFunctionContext = {
  request: Request
  env: {
    SUB2API_AUTH_URL?: string
  }
  params: {
    path?: string | string[]
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': `${ALLOWED_METHODS.join(', ')}, OPTIONS`,
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function jsonResponse(request: Request, status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function normalizeBaseUrl(input: string) {
  const raw = input.trim().replace(/\/+$/, '') || DEFAULT_TARGET
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('Unsupported Sub2API protocol.')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

function getPath(params: PagesFunctionContext['params']) {
  const rawPath = params.path
  const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath || ''
  return path.replace(/^\/+/, '')
}

function createProxyHeaders(request: Request) {
  const headers = new Headers()
  const authorization = request.headers.get('Authorization')
  const contentType = request.headers.get('Content-Type')
  const accept = request.headers.get('Accept')

  if (authorization) headers.set('Authorization', authorization)
  if (contentType) headers.set('Content-Type', contentType)
  if (accept) headers.set('Accept', accept)
  return headers
}

function createResponseHeaders(request: Request, upstreamHeaders: Headers) {
  const headers = new Headers(upstreamHeaders)
  const cors = corsHeaders(request)
  headers.set('Access-Control-Allow-Origin', cors['Access-Control-Allow-Origin'])
  headers.set('Access-Control-Allow-Methods', cors['Access-Control-Allow-Methods'])
  headers.set('Access-Control-Allow-Headers', cors['Access-Control-Allow-Headers'])
  headers.set('Vary', 'Origin')
  headers.delete('Content-Encoding')
  headers.delete('Content-Length')
  return headers
}

async function handleProxy({ request, env, params }: PagesFunctionContext) {
  const path = getPath(params)
  if (!path) return jsonResponse(request, 403, 'Sub2API auth path is required.')
  if (path !== 'settings/public' && path !== 'keys' && !path.startsWith('keys/') && !path.startsWith('auth/')) {
    return jsonResponse(request, 403, 'Sub2API auth path is not allowed.')
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0')
  if (request.method !== 'GET' && contentLength > MAX_BODY_BYTES) {
    return jsonResponse(request, 413, 'Request body is too large.')
  }

  let targetUrl: URL
  try {
    const requestUrl = new URL(request.url)
    targetUrl = new URL(`${normalizeBaseUrl(env.SUB2API_AUTH_URL || DEFAULT_TARGET)}/${path}`)
    targetUrl.search = requestUrl.search
  } catch {
    return jsonResponse(request, 500, 'Invalid Sub2API auth URL.')
  }

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: createProxyHeaders(request),
      body: request.method === 'GET' ? undefined : request.body,
    })
  } catch {
    return jsonResponse(request, 502, 'Sub2API auth service is unavailable.')
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: createResponseHeaders(request, upstreamResponse.headers),
  })
}

export const onRequest = async (context: PagesFunctionContext) => {
  const { request } = context
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (ALLOWED_METHODS.includes(request.method)) return handleProxy(context)
  return jsonResponse(request, 405, `Method ${request.method} is not allowed.`)
}
