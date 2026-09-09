'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Search,
  Settings,
  HelpCircle,
  ChevronRight,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { checkBackendHealth } from '@/lib/api';
import { useBackendSession } from '@/lib/backend-session';
import { ExchangeModal } from '@/components/dashboard/exchange-modal';

interface TopBarProps {
  harmonizationStatus: 'idle' | 'running' | 'complete' | 'error';
  parcelsProcessed: number;
  conflictsFound: number;
}

export function TopBar({
  harmonizationStatus,
  parcelsProcessed,
  conflictsFound,
}: TopBarProps) {
  const [exchangeOpen, setExchangeOpen] = useState(false);

  const statusMap = {
    idle: { label: 'Standby', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
    running: { label: 'Pipeline Live', color: 'text-primary', dot: 'bg-primary animate-pulse' },
    complete: { label: 'Harmonized Ready', color: 'text-emerald-400', dot: 'bg-emerald-400' },
    error: { label: 'Pipeline Error', color: 'text-rose-400', dot: 'bg-rose-400' },
  };

  const status = statusMap[harmonizationStatus];
  const { health, setHealth } = useBackendSession();

  useEffect(() => {
    let cancelled = false;

    const ping = () => {
      void checkBackendHealth()
        .then(() => {
          if (!cancelled) setHealth('ok');
        })
        .catch(() => {
          if (!cancelled) setHealth('down');
        });
    };

    ping();
    const timer = window.setInterval(ping, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [setHealth]);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/60 px-5 backdrop-blur-md">
        {/* Breadcrumb / Project Identifier */}
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Cadastral Repository</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-muted-foreground">National Land Record Modernization</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="font-semibold text-foreground">Sector Survey Fabric (EPSG:32643)</span>
          </nav>
        </div>

        {/* Center Live Status */}
        <div className="hidden items-center gap-4 md:flex">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${status.dot}`} />
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>
          {harmonizationStatus !== 'idle' && (
            <>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Features</span>
                <span className="font-mono text-xs font-semibold text-foreground">{parcelsProcessed}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Conflicts</span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    conflictsFound > 0 ? 'text-amber-400' : 'text-foreground'
                  }`}
                >
                  {conflictsFound}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Inter-Departmental Exchange Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExchangeOpen(true)}
            className="gap-1.5 text-xs border-primary/40 bg-primary/5 hover:bg-primary/15 text-sky-300 font-medium shadow-sm"
          >
            <Network className="h-3.5 w-3.5 text-primary" />
            <span>Inter-Departmental Exchange</span>
          </Button>

          {/* Backend Health Badge */}
          <div
            className="hidden items-center gap-1.5 border border-border bg-background/60 px-2.5 py-1 text-[10px] uppercase tracking-wider md:flex font-mono"
            title={health === 'ok' ? 'FastAPI Backend Engine Online' : 'Connecting to API'}
          >
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                health === 'ok' ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span className={health === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
              {health === 'ok' ? 'API Engine' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      <ExchangeModal open={exchangeOpen} onOpenChange={setExchangeOpen} />
    </>
  );
}
