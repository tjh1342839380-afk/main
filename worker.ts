import { onRequest as handleApiProxy } from './functions/api-proxy/[[path]]'
import { onRequest as handleSub2ApiAuth } from './functions/sub2api-auth/[[path]]'

type Env = {
    API_PROXY_URL?: string
    SUB2API_AUTH_URL?: string
    ASSETS: {
        fetch: (request: Request) => Promise<Response>
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const path = new URL(request.url).pathname

        if (path === '/api-proxy' || path.startsWith('/api-proxy/')) {
            return handleApiProxy({
                request,
                env,
                params: { path: path.replace(/^\/api-proxy\/?/, '') },
            })
        }

        if (path === '/sub2api-auth' || path.startsWith('/sub2api-auth/')) {
            return handleSub2ApiAuth({
                request,
                env,
                params: { path: path.replace(/^\/sub2api-auth\/?/, '') },
            })
        }

        return env.ASSETS.fetch(request)
    },
}
