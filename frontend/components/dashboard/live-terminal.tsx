'use client';

import { Terminal, Shield, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { JobLogEntry } from '@/lib/api';

interface LiveTerminalProps {
  logs: JobLogEntry[];
  stage: string;
  progress: number;
  status: 'idle' | 'running' | 'complete' | 'error';
}

export function LiveTerminal({ logs, stage, progress, status }: LiveTerminalProps) {
  if (status === 'idle' && !logs.length) {
    return null;
  }

  return (
    <div className="border border-border/80 bg-black/90 p-3 rounded-none font-mono text-[11px] shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <Terminal className="h-3.5 w-3.5" />
          <span>Real-time SSE Pipeline Stream</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {status === 'running' && (
            <span className="flex items-center gap-1 text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>LIVE ({progress}%)</span>
            </span>
          )}
          {status === 'complete' && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span>COMPLETED</span>
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-rose-400">
              <AlertCircle className="h-3 w-3" />
              <span>FAILED</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1 max-h-36 overflow-y-auto pr-1 text-muted-foreground scrollbar-thin">
        {logs.map((log, index) => (
          <div key={`${log.timestamp}-${index}`} className="flex items-start gap-2 leading-relaxed">
            <span className="text-muted-foreground/60 text-[9px] shrink-0 pt-0.5">
              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '00:00:00'}
            </span>
            <span className="text-sky-400 font-semibold shrink-0">[{log.stage}]</span>
            <span className="text-foreground/90">{log.message}</span>
            {log.metrics && Object.keys(log.metrics).length > 0 && (
              <span className="text-amber-300 text-[10px]">
                {JSON.stringify(log.metrics)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
