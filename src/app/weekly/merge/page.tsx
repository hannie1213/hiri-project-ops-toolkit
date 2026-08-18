import Link from "next/link";
import { Card } from "@/components/ui";

export default function WeeklyMergeRedirectPage() {
  return <Card className="mx-auto max-w-xl p-8 text-center"><h1 className="text-lg font-bold">周报功能已调整为纯 Excel 合成</h1><p className="mt-3 text-sm text-slate-600">不再提供在线填写、编辑、审批或提交功能。</p><Link className="mt-5 inline-block text-blue-600 hover:underline" href="/weekly">前往周报 Excel 合成</Link></Card>;
}
