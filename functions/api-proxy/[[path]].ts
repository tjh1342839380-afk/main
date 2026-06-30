const DEFAULT_TARGET = 'https://api.openai.com/v1'
const MAX_BODY_BYTES = 25 * 1024 * 1024

type PagesFunctionContext = {
  request: Request
  env: {
    API_PROXY_URL?: string
  }
  params: {
    path?: string | string[]
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return DEFAULT_TARGET

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  const url = new URL(withProtocol)
  if (url.protocol !== 'https:') {
    throw new Error('Unsupported proxy target protocol.')
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const v1Index = segments.indexOf('v1')
  const normalizedSegments = v1Index >= 0
    ? segments.slice(0, v1Index + 1)
    : [...segments, 'v1']

  url.pathname = `/${normalizedSegments.join('/')}`
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
  headers.set('Access-Control-Allow-Origin', corsHeaders(request)['Access-Control-Allow-Origin'])
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'authorization, content-type')
  headers.set('Vary', 'Origin')
  headers.delete('Content-Encoding')
  headers.delete('Content-Length')
  return headers
}

function handleOptions(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

async function handlePost({ request, env, params }: PagesFunctionContext) {
  const path = getPath(params)
  if (!path) {
    return jsonResponse(request, 403, 'API proxy path is required.')
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(request, 413, 'Request body is too large for the API proxy.')
  }

  let targetUrl: URL
  try {
    const requestUrl = new URL(request.url)
    const dynamicTarget = requestUrl.searchParams.get('target') || ''
    requestUrl.searchParams.delete('target')
    const targetBaseUrl = normalizeBaseUrl(dynamicTarget || env.API_PROXY_URL || DEFAULT_TARGET)
    targetUrl = new URL(`${targetBaseUrl}/${path}`)
    targetUrl.search = requestUrl.search
  } catch {
    return jsonResponse(request, 500, 'Invalid API proxy target URL.')
  }

  const upstreamResponse = await fetch(targetUrl, {
    method: 'POST',
    headers: createProxyHeaders(request),
    body: request.body,
  })

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: createResponseHeaders(request, upstreamResponse.headers),
  })
}

export const onRequest = async (context: PagesFunctionContext) => {
  const { request } = context
  if (request.method === 'OPTIONS') return handleOptions(request)
  if (request.method === 'POST') return handlePost(context)
  return jsonResponse(request, 405, `Method ${request.method} is not allowed.`)
}
