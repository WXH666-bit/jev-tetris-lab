import {
  jsonSchema,
  questionsSchema,
  type Json,
  type Questions,
} from "../lab/contracts.js";
export const templates: Record<
  string,
  { name: string; state: Json; questions: Questions }
> = {
  support: {
    name: "客服工单分流（虚构）",
    state: {
      ticketId: "DEMO-104",
      customer: "虚构客户 A",
      message: "订阅已扣款，但工作区仍显示免费版。请帮我检查。",
      plan: "团队版",
      fictional: true,
    },
    questions: {
      route: {
        type: "choice",
        instructions: "选择处理该工单的团队。",
        criteria: {
          billing: "账单与支付团队",
          technical: "技术支持团队",
          sales: "销售团队",
        },
      },
      escalate: {
        type: "noul",
        instructions: "该工单是否需要立即升级给主管？",
        criteria: { true: "紧急或影响严重", false: "常规团队能够处理" },
      },
      urgency: {
        type: "score",
        instructions: "评价工单紧急程度。",
        criteria: ["常规咨询", "需要跟进", "服务受阻", "重大紧急问题"],
      },
    },
  },
  priority: {
    name: "任务优先级选择（虚构）",
    state: {
      tasks: [
        {
          id: "fix_login",
          description: "修复部分测试用户登录失败",
          impact: "高",
          hours: 2,
        },
        { id: "docs", description: "补充内部文档", impact: "低", hours: 1 },
        { id: "theme", description: "优化主题颜色", impact: "中", hours: 4 },
      ],
      availableHours: 3,
      fictional: true,
    },
    questions: {
      priority: {
        type: "choice",
        instructions: "在可用时间内选择应优先执行的一项任务。",
        criteria: {
          fix_login: "修复登录问题",
          docs: "补充文档",
          theme: "优化主题",
        },
      },
      feasible: {
        type: "noul",
        instructions: "按提供的时间信息，是否有任务可以在当前时间预算内完成？",
      },
      clarity: {
        type: "score",
        instructions: "评估任务描述是否充分支持优先级判断。",
        criteria: ["信息不足", "可作初步判断", "信息充分"],
      },
    },
  },
};
export const playgroundDefinition = {
  id: "playground",
  name: "结构化决策工作台",
  english: "Decision Playground",
  version: "1.0.0",
  description: "编辑 state 与显式题型，检查 choice、noul、score 的返回契约。",
  ability: "结构化判断 · 标准设计 · 响应校验",
  modes: ["mock", "real"] as const,
  kind: "single" as const,
  baselineVersion: "mock-first-choice-v1",
  validateInput(state: unknown, questions: unknown) {
    return {
      state: jsonSchema.parse(state),
      questions: questionsSchema.parse(questions),
    };
  },
};
