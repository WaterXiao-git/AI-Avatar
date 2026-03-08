/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import ShellLayout from "../components/ShellLayout";
import { getHistoryDetail, myHistory, myModels, myRecordings } from "../lib/api";
import { toAbsoluteUrl } from "../lib/config";
import { toChinesePresetName } from "../lib/displayNames";

const DASHBOARD_PAGE_SIZE = 4;
const RECORDING_PAGE_SIZE = 2;

export default function DashboardPage() {
  const [models, setModels] = useState([]);
  const [history, setHistory] = useState([]);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({});
  const [q, setQ] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [modelPage, setModelPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [modelMeta, setModelMeta] = useState({ total: 0, pageSize: DASHBOARD_PAGE_SIZE });
  const [historyMeta, setHistoryMeta] = useState({ total: 0, pageSize: DASHBOARD_PAGE_SIZE });
  const [recordings, setRecordings] = useState([]);
  const [recordingPage, setRecordingPage] = useState(1);
  const [recordingMeta, setRecordingMeta] = useState({ total: 0, pageSize: RECORDING_PAGE_SIZE });
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadAll(nextModelPage = modelPage, nextHistoryPage = historyPage, nextRecordingPage = recordingPage) {
    setLoadingAll(true);
    setErrorMessage("");
    try {
      const [m, h, r] = await Promise.all([
        myModels({ page: nextModelPage, pageSize: DASHBOARD_PAGE_SIZE }),
        myHistory({
          q,
          start: start ? `${start}T00:00:00` : "",
          end: end ? `${end}T23:59:59` : "",
          page: nextHistoryPage,
          pageSize: DASHBOARD_PAGE_SIZE,
        }),
        myRecordings({ page: nextRecordingPage, pageSize: RECORDING_PAGE_SIZE }),
      ]);
      setModels(m.items || []);
      setHistory(h.items || []);
      setModelMeta({ total: m.total || 0, pageSize: DASHBOARD_PAGE_SIZE });
      setHistoryMeta({ total: h.total || 0, pageSize: DASHBOARD_PAGE_SIZE });
      setRecordings(r.items || []);
      setRecordingMeta({ total: r.total || 0, pageSize: RECORDING_PAGE_SIZE });
      setModelPage(m.page || nextModelPage);
      setHistoryPage(h.page || nextHistoryPage);
      setRecordingPage(r.page || nextRecordingPage);
    } catch (error) {
      setErrorMessage(error?.message || "加载数据失败，请稍后重试。");
    } finally {
      setLoadingAll(false);
    }
  }

  useEffect(() => {
    loadAll(1, 1, 1);
  }, []);

  async function openSession(id) {
    if (expandedSessionId === id) {
      setExpandedSessionId(null);
      return;
    }

    if (!sessionDetails[id]) {
      setLoadingSessionId(id);
      try {
        const detail = await getHistoryDetail(id);
        setSessionDetails((prev) => ({ ...prev, [id]: detail }));
      } catch (error) {
        setErrorMessage(error?.message || "会话详情加载失败。");
        return;
      } finally {
        setLoadingSessionId(null);
      }
    }
    setExpandedSessionId(id);
  }

  function buildKeyMoments(detail) {
    const events = detail?.events || [];
    if (!events.length) {
      return [{ key: "none", label: "无有效语音文本", role: "system", text: "本次会话没有可提炼的文本节点。" }];
    }

    const users = events.filter((evt) => evt.role === "user");
    const assistants = events.filter((evt) => evt.role === "assistant");

    const moments = [];
    const firstUser = users[0];
    const firstAssistant = assistants[0];
    const lastUser = users[users.length - 1];
    const lastAssistant = assistants[assistants.length - 1];

    if (firstUser) moments.push({ key: `fu-${firstUser.id}`, label: "开场输入", role: "user", text: firstUser.text, at: firstUser.created_at });
    if (firstAssistant) moments.push({ key: `fa-${firstAssistant.id}`, label: "首次响应", role: "assistant", text: firstAssistant.text, at: firstAssistant.created_at });
    if (lastUser && lastUser.id !== firstUser?.id) {
      moments.push({ key: `lu-${lastUser.id}`, label: "结束前输入", role: "user", text: lastUser.text, at: lastUser.created_at });
    }
    if (lastAssistant && lastAssistant.id !== firstAssistant?.id) {
      moments.push({ key: `la-${lastAssistant.id}`, label: "结束前响应", role: "assistant", text: lastAssistant.text, at: lastAssistant.created_at });
    }
    return moments;
  }

  function formatTime(value) {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function getTotalPages(meta) {
    return Math.max(1, Math.ceil((meta.total || 0) / (meta.pageSize || 1)));
  }

  const latestActivity = useMemo(() => {
    const times = [
      ...models.map((item) => item.created_at),
      ...history.map((item) => item.ended_at || item.started_at),
      ...recordings.map((item) => item.created_at),
    ]
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));

    if (!times.length) {
      return "-";
    }

    return formatTime(new Date(Math.max(...times)).toISOString());
  }, [models, history, recordings]);

  return (
    <ShellLayout title="数据看板" subtitle="查看模型资产、互动会话与录制回放。">
      <div className="single-column">
        <section className="glass-panel dashboard-overview-panel">
          <div className="dashboard-overview-head">
            <div>
              <h2>工作台总览</h2>
              <p className="muted">这个页面参考了主流 SaaS 控制台的信息分层方式，把关键指标、过滤和明细拆开。</p>
            </div>
            <button type="button" className="secondary-btn dashboard-refresh-btn" onClick={() => loadAll()} disabled={loadingAll}>
              {loadingAll ? "刷新中..." : "刷新数据"}
            </button>
          </div>

          <div className="dashboard-kpi-grid">
            <article className="dashboard-kpi-card">
              <p>模型总数</p>
              <strong>{modelMeta.total}</strong>
              <span>当前页 {modelPage} / {getTotalPages(modelMeta)}</span>
            </article>
            <article className="dashboard-kpi-card">
              <p>会话总数</p>
              <strong>{historyMeta.total}</strong>
              <span>当前页 {historyPage} / {getTotalPages(historyMeta)}</span>
            </article>
            <article className="dashboard-kpi-card">
              <p>录制总数</p>
              <strong>{recordingMeta.total}</strong>
              <span>当前页 {recordingPage} / {getTotalPages(recordingMeta)}</span>
            </article>
            <article className="dashboard-kpi-card">
              <p>最近活动</p>
              <strong className="dashboard-kpi-time">{latestActivity}</strong>
              <span>来自模型/会话/录制</span>
            </article>
          </div>
        </section>

        <section className="glass-panel">
          <div className="dashboard-section-head">
            <h2>历史筛选</h2>
            <span className="dashboard-section-tag">Filter</span>
          </div>
          <div className="dashboard-filter-wrap">
            <div className="dashboard-filter-grid">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="关键词（摘要内容）" />
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="dashboard-filter-actions">
              <button type="button" className="secondary-btn" onClick={() => loadAll(1, 1, 1)}>
                应用筛选
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setQ("");
                  setStart("");
                  setEnd("");
                  loadAll(1, 1, 1);
                }}
              >
                清空
              </button>
            </div>
          </div>
        </section>

        {errorMessage ? <div className="status-box dashboard-status-error">{errorMessage}</div> : null}
        {loadingAll ? <div className="status-box">正在加载看板数据...</div> : null}

        <section className="glass-panel" style={{ marginTop: 12 }}>
          <div className="dashboard-section-head">
            <h2>我的模型</h2>
            <span className="dashboard-section-tag">{modelMeta.total} 条记录</span>
          </div>
          {models.length === 0 ? <p className="muted">暂无模型记录</p> : null}
          {models.length ? (
            <div className="dashboard-model-grid">
              {models.map((item) => {
                const version = item.cover_version ? `?v=${item.cover_version}` : "";
                const cover = item.preset_name
                  ? toAbsoluteUrl(`/assets/presets/${item.preset_name}/view.png${version}`)
                  : toAbsoluteUrl(`${item.cover_url || "/assets/models/model-placeholder.jpg"}${version}`);
                const downloadUrl = item.preset_name
                  ? toAbsoluteUrl(`/assets/presets/${item.preset_name}/avatar.fbx`)
                  : toAbsoluteUrl(item.model_url || "");
                return (
                  <div key={item.id} className="dashboard-card dashboard-model-card">
                    <img className="dashboard-model-cover" src={cover} alt="模型封面" loading="lazy" />
                    <div className="dashboard-model-main">
                      <div className="dashboard-card-title">模型 #{item.id}</div>
                      <div className="dashboard-card-meta">
                        来源：{item.source_type} / 预设：{item.preset_name ? toChinesePresetName(item.preset_name) : "-"}
                      </div>
                      <div className="dashboard-card-meta">创建时间：{formatTime(item.created_at)}</div>
                      {item.summary_text ? <div className="dashboard-summary">{item.summary_text}</div> : null}
                    </div>
                    <a href={downloadUrl} download className="secondary-btn dashboard-download-link dashboard-model-download-link">
                      下载模型
                    </a>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="row-btns" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="secondary-btn"
              disabled={modelPage <= 1}
              onClick={() => loadAll(modelPage - 1, historyPage, recordingPage)}
            >
              模型上一页
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={modelPage * modelMeta.pageSize >= modelMeta.total}
              onClick={() => loadAll(modelPage + 1, historyPage, recordingPage)}
            >
              模型下一页
            </button>
          </div>
          <p className="dashboard-page-hint">第 {modelPage} 页，共 {getTotalPages(modelMeta)} 页</p>
        </section>

        <section className="glass-panel" style={{ marginTop: 12 }}>
          <div className="dashboard-section-head">
            <h2>交互历史</h2>
            <span className="dashboard-section-tag">{historyMeta.total} 条记录</span>
          </div>
          {history.length === 0 ? <p className="muted">暂无交互历史</p> : null}
          {history.map((item) => (
            <div key={item.id} className="dashboard-card">
              <div className="dashboard-card-title">对话会话 #{item.id}</div>
              <div className="dashboard-card-meta">开始：{formatTime(item.started_at)}</div>
              <div className="dashboard-card-meta">结束：{formatTime(item.ended_at)}</div>
              <div className="dashboard-card-meta">
                轮次：{item.turns} / 输入：{item.input_count} / 输出：{item.output_count}
              </div>
              <div className="dashboard-summary">{item.summary_text || "本次会话暂无可提炼摘要。"}</div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => openSession(item.id)}
                disabled={loadingSessionId === item.id}
              >
                {loadingSessionId === item.id
                  ? "加载会话详情..."
                  : expandedSessionId === item.id
                    ? "收起关键节点"
                    : "展开关键节点"}
              </button>

              {expandedSessionId === item.id ? (
                <div className="timeline-wrap">
                  {buildKeyMoments(sessionDetails[item.id]).map((moment) => (
                    <div key={moment.key} className="timeline-item">
                      <div className={moment.role === "assistant" ? "timeline-dot assistant" : "timeline-dot"} />
                      <div className="timeline-content">
                        <div className="timeline-title">
                          {moment.label}
                          {moment.at ? <span>{formatTime(moment.at)}</span> : null}
                        </div>
                        <div className="timeline-text">{moment.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div className="row-btns" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="secondary-btn"
              disabled={historyPage <= 1}
              onClick={() => loadAll(modelPage, historyPage - 1, recordingPage)}
            >
              历史上一页
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={historyPage * historyMeta.pageSize >= historyMeta.total}
              onClick={() => loadAll(modelPage, historyPage + 1, recordingPage)}
            >
              历史下一页
            </button>
          </div>
          <p className="dashboard-page-hint">第 {historyPage} 页，共 {getTotalPages(historyMeta)} 页</p>
        </section>

        <section className="glass-panel" style={{ marginTop: 12 }}>
          <div className="dashboard-section-head">
            <h2>我的录制</h2>
            <span className="dashboard-section-tag">{recordingMeta.total} 条记录</span>
          </div>
          {recordings.length === 0 ? <p className="muted">暂无录制视频</p> : null}
          {recordings.map((item) => {
            const src = toAbsoluteUrl(item.file_url || "");
            return (
              <div key={item.id} className="dashboard-card">
                <div className="dashboard-card-title">录制 #{item.id}</div>
                <div className="dashboard-card-meta">创建时间：{formatTime(item.created_at)}</div>
                <div className="dashboard-card-meta">时长：{Math.max(0, Math.round((item.duration_ms || 0) / 1000))} 秒</div>
                <video className="dashboard-recording-video" src={src} controls preload="metadata" />
                <a href={src} download className="secondary-btn dashboard-download-link">
                  下载视频
                </a>
              </div>
            );
          })}
          <div className="row-btns" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="secondary-btn"
              disabled={recordingPage <= 1}
              onClick={() => loadAll(modelPage, historyPage, recordingPage - 1)}
            >
              录制上一页
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={recordingPage * recordingMeta.pageSize >= recordingMeta.total}
              onClick={() => loadAll(modelPage, historyPage, recordingPage + 1)}
            >
              录制下一页
            </button>
          </div>
          <p className="dashboard-page-hint">第 {recordingPage} 页，共 {getTotalPages(recordingMeta)} 页</p>
        </section>
      </div>
    </ShellLayout>
  );
}
