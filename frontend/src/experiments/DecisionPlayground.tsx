import { useMemo, useState } from "react";
import {
  templates,
  playgroundDefinition,
} from "../../../shared/experiments/playground";
import {
  questionsSchema,
  jsonSchema,
  inputErrors,
  type Json,
  type Questions,
} from "../../../shared/lab/contracts";
import type { RunMode } from "../../../shared/lab/records";
import { mockAnswers } from "../../../shared/lab/contracts";
import { useLabRunner, type RunnerDefinition } from "../lab/useLabRunner";
import { Workspace } from "../lab/context";
import { Observer } from "../lab/Observer";
import { JsonViewer } from "../components/JsonViewer";
type Draft = { state: Json; questions: Questions };
// The runner keeps questions in its environment, but sends only state to the provider.
const definition: RunnerDefinition<Draft> = {
  ...playgroundDefinition,
  requestState: (s) => s.state,
  questions: (s) => s.questions,
  candidates: (s) =>
    Object.entries(s.questions).flatMap(([id, q]) =>
      q.type === "choice"
        ? Object.entries(q.criteria).map(([key, label]) => ({
            questionId: id,
            id: `${id}/${key}`,
            label: `${id} / ${key}`,
            details: label,
          }))
        : [],
    ),
  execute: (s, answers) => ({
    state: s,
    action: Object.entries(answers)
      .map(
        ([id, a]) =>
          `${id}: ${a.type === "choice" ? a.choice : a.type === "noul" ? a.noul : a.score}`,
      )
      .join("；"),
    execution: {
      validatedAnswers: answers,
      meaning: "单次结构化判断；不执行外部业务操作",
    },
  }),
  metrics: (s) => ({ 问题数量: Object.keys(s.questions).length }),
  terminal: () => null,
  local: (s) => mockAnswers(s.questions),
};
type Entry = {
  id: string;
  type: "choice" | "noul" | "score";
  instructions: string;
  criteria: string;
};
function entries(questions: Questions): Entry[] {
  return Object.entries(questions).map(([id, q]) => ({
    id,
    type: q.type,
    instructions: q.instructions,
    criteria: JSON.stringify(
      q.criteria ?? { true: "是", false: "否" },
      null,
      2,
    ),
  }));
}
export default function DecisionPlayground() {
  const first = templates.support;
  const [stateText, setStateText] = useState(
    JSON.stringify(first.state, null, 2),
  );
  const [form, setForm] = useState(entries(first.questions));
  const [editor, setEditor] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState(
    JSON.stringify(first.questions, null, 2),
  );
  const [template, setTemplate] = useState("support");
  const [inputVersion, setInputVersion] = useState(0);
  const parsed = useMemo(() => {
    try {
      let state: Json;
      try {
        state = jsonSchema.parse(JSON.parse(stateText));
      } catch (e) {
        throw Error(`state: ${inputErrors(e)}`);
      }
      let questions: Questions;
      try {
        if (editor === "json")
          questions = questionsSchema.parse(JSON.parse(jsonText));
        else {
          if (new Set(form.map((e) => e.id)).size !== form.length)
            throw Error("问题 ID 重复");
          questions = questionsSchema.parse(
            Object.fromEntries(
              form.map((q) => {
                let criteria;
                try {
                  criteria = JSON.parse(q.criteria);
                } catch (e) {
                  throw Error(`${q.id}.criteria: ${(e as Error).message}`);
                }
                return [
                  q.id,
                  { type: q.type, instructions: q.instructions, criteria },
                ];
              }),
            ),
          );
        }
      } catch (e) {
        throw Error(`questions: ${inputErrors(e)}`);
      }
      return { value: { state, questions }, error: "" };
    } catch (e) {
      return { value: null, error: inputErrors(e) };
    }
  }, [stateText, form, jsonText, editor]);
  const runner = useLabRunner(definition, {
    state: first.state,
    questions: first.questions,
  });
  const [submittedVersion, setSubmittedVersion] = useState(-1);
  function changed() {
    runner.pause();
    setInputVersion((v) => v + 1);
  }
  function load(key: string) {
    const t = templates[key];
    setTemplate(key);
    setStateText(JSON.stringify(t.state, null, 2));
    setForm(entries(t.questions));
    setJsonText(JSON.stringify(t.questions, null, 2));
    runner.reset({ state: t.state, questions: t.questions });
    setInputVersion((v) => v + 1);
    setSubmittedVersion(-1);
  }
  function execute() {
    if (!parsed.value) return;
    if (submittedVersion === inputVersion) return;
    runner.reset(parsed.value);
    setSubmittedVersion(inputVersion);
    queueMicrotask(() => void runner.start(true));
  }
  return (
    <Workspace
      observer={
        <Observer
          key={runner.runId}
          stage={runner.stage}
          current={runner.current}
          steps={runner.steps}
          metrics={{
            执行次数: runner.counts.steps,
            请求次数: runner.counts.requests,
            本次耗时: `${runner.counts.latency} ms`,
          }}
        />
      }
    >
      <section className="panel lab-environment">
        <div className="panel-header">
          <h2>设计一个可验证的问题</h2>
          <span className="badge">单次决策</span>
        </div>
        <div className="environment-body">
          <div className="lab-controls">
            <label>
              虚构数据模板
              <select value={template} onChange={(e) => load(e.target.value)}>
                {Object.entries(templates).map(([id, t]) => (
                  <option key={id} value={id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              运行模式
              <select
                aria-label="工作台运行模式"
                value={runner.mode}
                onChange={(e) => {
                  runner.setMode(e.target.value as RunMode);
                  setSubmittedVersion(-1);
                }}
              >
                <option value="mock">Mock 模拟</option>
                <option value="real">真实 AI</option>
              </select>
            </label>
          </div>
          <label>
            state · 当前场景 JSON
            <textarea
              className="code-editor"
              aria-label="state JSON"
              rows={7}
              value={stateText}
              onChange={(e) => {
                changed();
                setStateText(e.target.value);
              }}
            />
          </label>
          <div className="editor-heading">
            <h3>questions · 显式问题</h3>
            <button
              onClick={() => {
                if (editor === "form") {
                  if (parsed.value)
                    setJsonText(
                      JSON.stringify(parsed.value.questions, null, 2),
                    );
                  setEditor("json");
                } else {
                  try {
                    setForm(
                      entries(questionsSchema.parse(JSON.parse(jsonText))),
                    );
                    setEditor("form");
                  } catch {
                    /* Current JSON validation is already displayed below. */
                  }
                }
              }}
            >
              {editor === "form" ? "切换 JSON 编辑" : "切换表单编辑"}
            </button>
          </div>
          {editor === "json" ? (
            <label>
              questions JSON
              <textarea
                className="code-editor"
                aria-label="questions JSON"
                rows={16}
                value={jsonText}
                onChange={(e) => {
                  changed();
                  setJsonText(e.target.value);
                }}
              />
            </label>
          ) : (
            <>
              {form.map((q, i) => (
                <fieldset className="question-editor" key={i}>
                  <div className="lab-controls">
                    <label>
                      问题 ID
                      <input
                        aria-label={`问题 ${i + 1} ID`}
                        value={q.id}
                        onChange={(e) => {
                          changed();
                          setForm((f) =>
                            f.map((v, j) =>
                              j === i ? { ...v, id: e.target.value } : v,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      题型
                      <select
                        value={q.type}
                        onChange={(e) => {
                          changed();
                          const type = e.target.value as Entry["type"];
                          setForm((f) =>
                            f.map((v, j) =>
                              j === i
                                ? {
                                    ...v,
                                    type,
                                    criteria:
                                      type === "score"
                                        ? '["低", "中", "高"]'
                                        : type === "noul"
                                          ? '{"true":"是","false":"否"}'
                                          : '{"option_a":"选项 A","option_b":"选项 B"}',
                                  }
                                : v,
                            ),
                          );
                        }}
                      >
                        <option value="choice">choice · 合法选择</option>
                        <option value="noul">noul · 是的概率</option>
                        <option value="score">score · 有序评分</option>
                      </select>
                    </label>
                    <button
                      onClick={() => {
                        changed();
                        setForm((f) => f.filter((_, j) => j !== i));
                      }}
                    >
                      删除问题
                    </button>
                  </div>
                  <label>
                    instructions · 问题说明
                    <textarea
                      rows={2}
                      value={q.instructions}
                      onChange={(e) => {
                        changed();
                        setForm((f) =>
                          f.map((v, j) =>
                            j === i
                              ? { ...v, instructions: e.target.value }
                              : v,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label>
                    criteria ·{" "}
                    {q.type === "score"
                      ? "有序描述数组；范围为 0 到级别数减 1"
                      : q.type === "choice"
                        ? "候选 ID → 描述对象"
                        : "true / false 解释对象"}
                    <textarea
                      className="code-editor"
                      rows={4}
                      value={q.criteria}
                      onChange={(e) => {
                        changed();
                        setForm((f) =>
                          f.map((v, j) =>
                            j === i ? { ...v, criteria: e.target.value } : v,
                          ),
                        );
                      }}
                    />
                  </label>
                </fieldset>
              ))}
              <button
                onClick={() => {
                  changed();
                  setForm((f) => [
                    ...f,
                    {
                      id: `question_${f.length + 1}`,
                      type: "choice",
                      instructions: "请选择一个候选。",
                      criteria: '{"a":"选项 A","b":"选项 B"}',
                    },
                  ]);
                }}
              >
                添加问题
              </button>
            </>
          )}
          {parsed.error && (
            <pre className="error validation-error" role="alert">
              {parsed.error}
            </pre>
          )}
          {runner.error && (
            <p className="error" role="alert">
              {runner.error}
            </p>
          )}
          <div className="lab-buttons">
            <button
              className="primary"
              disabled={
                !parsed.value ||
                runner.running ||
                submittedVersion === inputVersion
              }
              onClick={execute}
            >
              执行一次决策
            </button>
            {runner.running && <button onClick={runner.pause}>取消请求</button>}
            <button
              disabled={runner.running}
              onClick={() => {
                if (parsed.value) runner.reset(parsed.value);
                setSubmittedVersion(-1);
              }}
            >
              新建本次运行
            </button>
          </div>
          <p className="muted">
            Mock
            只用于契约演示，不代表业务判断能力。一次点击只发送一次主要请求；本工作台不自动循环，也不执行真实业务操作。
          </p>
          <JsonViewer
            label="提交预览（state + questions）"
            value={parsed.value}
          />
        </div>
      </section>
    </Workspace>
  );
}
