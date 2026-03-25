import { useProcesses } from '../../context/ProcessContext';
import { CpuGraph } from './CpuGraph';
import type { OSProcess } from '../../types';
import './ProcessManager.css';

function cpuBarColor(pct: number): string {
  if (pct < 30) return '#4caf50';
  if (pct < 70) return '#ff9800';
  return '#f44336';
}

function formatUptime(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function ProcessRow({ proc }: { proc: OSProcess }) {
  return (
    <tr className={`pm-row pm-row-${proc.type}`}>
      <td className="pm-pid">{proc.pid}</td>
      <td className="pm-name">
        <span className="pm-type-dot" style={{ background: proc.type === 'system' ? '#888' : '#0078d4' }} />
        {proc.name}
      </td>
      <td className="pm-type">{proc.type === 'system' ? 'Sistema' : 'App'}</td>
      <td className="pm-cpu">
        <div className="pm-bar-wrap">
          <div
            className="pm-bar"
            style={{
              width: `${Math.min(100, proc.cpuPercent)}%`,
              background: cpuBarColor(proc.cpuPercent),
            }}
          />
          <span className="pm-bar-label">{Math.round(proc.cpuPercent)}%</span>
        </div>
      </td>
      <td className="pm-mem">{proc.memoryMB} MB</td>
      <td className="pm-uptime">{formatUptime(proc.startedAt)}</td>
    </tr>
  );
}

export function ProcessManager() {
  const { state } = useProcesses();
  const { processes, cpuHistory } = state;

  const totalCpu = Math.min(100, Math.round(processes.reduce((s, p) => s + p.cpuPercent, 0)));
  const totalMem = processes.reduce((s, p) => s + p.memoryMB, 0);

  const sorted = [...processes].sort((a, b) => b.cpuPercent - a.cpuPercent);

  return (
    <div className="pm">
      {/* Summary header */}
      <div className="pm-summary">
        <div className="pm-stat">
          <span className="pm-stat-label">CPU Total</span>
          <span className="pm-stat-value" style={{ color: cpuBarColor(totalCpu) }}>{totalCpu}%</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-label">Memoria</span>
          <span className="pm-stat-value">{totalMem} MB</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-label">Procesos</span>
          <span className="pm-stat-value">{processes.length}</span>
        </div>
        <div className="pm-note">* Valores simulados — contexto educativo</div>
      </div>

      {/* CPU graph */}
      <div className="pm-graph-section">
        <div className="pm-graph-label">Uso de CPU (últimos 60 segundos)</div>
        <CpuGraph history={cpuHistory} width={660} height={110} />
      </div>

      {/* Process table */}
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <th>PID</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>CPU %</th>
              <th>Memoria</th>
              <th>Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => <ProcessRow key={p.pid} proc={p} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
