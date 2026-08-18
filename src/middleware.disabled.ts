import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

// 需要登录的 API 路由（除登录接口）
const PROTECTED_API = "/api/";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API 路由鉴权
  if (pathname.startsWith(PROTECTED_API) && !pathname.startsWith("/api/auth/login")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const user = await verifySessionToken(token);
    if (!user) {
      return NextResponse.json({ ok: false, error: "登录已过期" }, { status: 401 });
    }
    // 将用户信息附加到请求头供下游使用
    const res = NextResponse.next();
    res.headers.set("x-user-id", user.id);
    res.headers.set("x-user-role", user.role);
    return res;
  }

  // 页面路由：未登录访问业务页跳转登录
  const publicPaths = ["/login", "/forbidden", "/_next", "/favicon.ico", "/robots.txt"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (!isPublic && pathname !== "/" && !pathname.startsWith("/api/")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
    const user = await verifySessionToken(token);
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
