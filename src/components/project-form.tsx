"use client";

import { useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { TEAMS, TEAM_LABEL, type TeamKey } from "@/lib/store";

export type MilestoneDraft = {
  name: string;
  plannedDate: string;
  actualDate: string;
  remark: string;
};

export type ProjectFormValue = {
  name: string;
  code: string;
  category: string;
  contractType: string;
  contractSignedDate: string;
  contractAmount: string;
  upstreamUnit: string;
  marketOwner: string;
  currentStatus: string;
  pmRaw: string;
  team: TeamKey | null;
  startDate: string;
  endDate: string;
  remark: string;
  milestones: MilestoneDraft[];
  version?: number;
};

export default function ProjectForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial: ProjectFormValue;
  submitting?: boolean;
  onSubmit: (v: ProjectFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<ProjectFormValue>(initial);
  const [error, setError] = useState("");

  function set<K extends keyof ProjectFormValue>(key: K, value: ProjectFormValue[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setMilestone(i: number, key: keyof MilestoneDraft, value: string) {
    setForm((f) => {
      const milestones = f.milestones.map((m, idx) => (idx === i ? { ...m, [key]: value } : m));
      return { ...f, milestones };
    });
  }

  function addMilestone() {
    setForm((f) => ({
      ...f,
      milestones: [...f.milestones, { name: "", plannedDate: "", actualDate: "", remark: "" }],
    }));
  }

  function removeMilestone(i: number) {
    setForm((f) => ({ ...f, milestones: f.milestones.filter((_, idx) => idx !== i) }));
  }

  function moveMilestone(i: number, dir: -1 | 1) {
    setForm((f) => {
      const ms = [...f.milestones];
      const j = i + dir;
      if (j < 0 || j >= ms.length) return f;
      [ms[i], ms[j]] = [ms[j], ms[i]];
      return { ...f, milestones: ms };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.code.trim() || !form.name.trim() || !form.pmRaw.trim()) {
      setError("项目编号、项目名称、项目经理均为必填项");
      return;
    }
    const milestoneNames = form.milestones.map((m) => m.name.trim()).filter(Boolean);
    const dup = milestoneNames.find((n, i) => milestoneNames.indexOf(n) !== i);
    if (dup) {
      setError(`节点名称重复：「${dup}」`);
      return;
    }
    await onSubmit({
      ...form,
      milestones: form.milestones.map((m, i) => ({ ...m, name: m.name.trim() || `节点${i + 1}` })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader title="基本信息" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="项目名称 *">
            <Input value={form.name} onChange={(v) => set("name", v)} placeholder="请输入项目名称" />
          </Field>
          <Field label="项目编号 *">
            <Input value={form.code} onChange={(v) => set("code", v)} placeholder="请输入项目编号" />
          </Field>
          <Field label="分类 / 产品线">
            <Input value={form.category} onChange={(v) => set("category", v)} placeholder="如：政务、金融…" />
          </Field>
          <Field label="项目经理 *" desc="多人用 / ／ 、 ， , ; 换行分隔">
            <Input value={form.pmRaw} onChange={(v) => set("pmRaw", v)} placeholder="张三/李四、王五" />
          </Field>
          <Field label="合同类型"><Input value={form.contractType} onChange={(v) => set("contractType", v)} /></Field>
          <Field label="合同签订日期"><Input type="date" value={form.contractSignedDate} onChange={(v) => set("contractSignedDate", v)} /></Field>
          <Field label="合同金额"><Input value={form.contractAmount} onChange={(v) => set("contractAmount", v)} placeholder="可保留单位或文本格式" /></Field>
          <Field label="上家单位"><Input value={form.upstreamUnit} onChange={(v) => set("upstreamUnit", v)} /></Field>
          <Field label="市场负责人"><Input value={form.marketOwner} onChange={(v) => set("marketOwner", v)} /></Field>
          <Field label="当前项目状态"><Input value={form.currentStatus} onChange={(v) => set("currentStatus", v)} placeholder="如：实施中、暂停、已验收" /></Field>
          <Field label="所属项目组" desc="用于项目管理按组筛选">
            <Select
              value={form.team ?? "NONE"}
              onChange={(v) => {
                const t = v === "NONE" ? null : (v as TeamKey);
                set("team", t);
              }}
              options={[
                { value: "NONE", label: "未分组" },
                ...TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] })),
              ]}
            />
          </Field>
          <Field label="计划开始日期">
            <Input type="date" value={form.startDate} onChange={(v) => set("startDate", v)} />
          </Field>
          <Field label="计划完成日期">
            <Input type="date" value={form.endDate} onChange={(v) => set("endDate", v)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="备注">
              <Input value={form.remark} onChange={(v) => set("remark", v)} placeholder="可选" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="进度节点"
          desc="「验收」节点为终审依据；实际日期留空显示「待补实际日期」，计划已过显示「有延期风险」"
          right={
            <Button variant="secondary" onClick={addMilestone} className="text-xs">
              <Plus className="h-4 w-4" /> 添加节点
            </Button>
          }
        />
        <div className="space-y-2 p-5">
          {form.milestones.length === 0 && (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-slate-400">
              暂无节点，点击「添加节点」创建（如：方案、立项、开发、测试、验收）
            </div>
          )}
          {form.milestones.map((m, i) => (
            <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-[#dbe6e0] bg-[#f5f9f7] p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveMilestone(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-200">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => moveMilestone(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-200">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-slate-400">{i + 1}</span>
              </div>
              <Input value={m.name} onChange={(v) => setMilestone(i, "name", v)} placeholder="节点名称（如 方案/验收）" />
              <Input type="date" value={m.plannedDate} onChange={(v) => setMilestone(i, "plannedDate", v)} placeholder="计划日期" />
              <Input type="date" value={m.actualDate} onChange={(v) => setMilestone(i, "actualDate", v)} placeholder="实际日期" />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  title="删除节点"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" variant="primary" disabled={submitting}>
          <Save className="h-4 w-4" /> {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[#365f50]">
        {label}
        {desc && <span className="ml-1 font-normal text-xs text-slate-400">{desc}</span>}
      </label>
      {children}
    </div>
  );
}
