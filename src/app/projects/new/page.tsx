"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProjectForm, { type ProjectFormValue } from "@/components/project-form";
import { createProject } from "@/lib/store";

export default function NewProjectPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const initial: ProjectFormValue = {
    name: "",
    code: "",
    category: "",
    pmRaw: "",
    startDate: "",
    endDate: "",
    remark: "",
    milestones: [
      { name: "方案", plannedDate: "", actualDate: "", remark: "" },
      { name: "立项", plannedDate: "", actualDate: "", remark: "" },
      { name: "开发", plannedDate: "", actualDate: "", remark: "" },
      { name: "测试", plannedDate: "", actualDate: "", remark: "" },
      { name: "验收", plannedDate: "", actualDate: "", remark: "" },
    ],
  };

  async function handleSubmit(v: ProjectFormValue) {
    setSubmitting(true);
    try {
      const p = createProject({
        name: v.name,
        code: v.code,
        category: v.category,
        pmRaw: v.pmRaw,
        startDate: v.startDate || null,
        endDate: v.endDate || null,
        remark: v.remark,
        milestones: v.milestones.map((m) => ({
          name: m.name,
          plannedDate: m.plannedDate || null,
          actualDate: m.actualDate || null,
        })),
      });
      router.push(`/projects/detail?id=${p.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">新建项目</h1>
        <p className="mt-0.5 text-sm text-slate-500">手工录入项目信息与进度节点</p>
      </div>
      <ProjectForm initial={initial} submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
