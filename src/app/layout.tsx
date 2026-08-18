import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "产品项目部工具优化平台",
  description: "项目进度监管 · 浏览器本地数据 · 静态版",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                  产
                </div>
                <span className="font-semibold">产品项目部工具优化平台</span>
              </div>
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/">仪表盘</NavLink>
                <NavLink href="/projects">项目管理</NavLink>
                <NavLink href="/import">导入</NavLink>
                <NavLink href="/reminders">提醒清单</NavLink>
                <NavLink href="/weekly">周报合成</NavLink>
                <NavLink href="/confirm">项目状态确认</NavLink>
                <NavLink href="/admin">本地数据</NavLink>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t py-4 text-center text-xs text-slate-400">
            本工具数据保存在当前浏览器，不会自动同步到其他电脑。
          </footer>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-md px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </a>
  );
}
