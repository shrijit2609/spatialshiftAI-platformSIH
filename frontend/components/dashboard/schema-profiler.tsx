'use client';

import { CheckCircle2, Database, HelpCircle, Layers, ShieldCheck, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SchemaProfile } from '@/lib/api';

interface SchemaProfilerProps {
  profile?: SchemaProfile;
  filename: string;
}

export function SchemaProfiler({ profile, filename }: SchemaProfilerProps) {
  if (!profile) return null;

  return (
    <div className="border border-border bg-card/60 p-3 text-xs space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span>Source Schema Adaptation</span>
        </div>
        <Badge variant="outline" className="border-primary/50 text-primary text-[9px]">
          {profile.confidence_pct}% Match
        </Badge>
      </div>

      <div className="border-l-2 border-primary/80 pl-2 py-0.5">
        <div className="text-[11px] font-bold text-sky-300">{profile.archetype_name}</div>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{profile.description}</p>
      </div>

      {Object.keys(profile.mapped_fields).length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Mapped Statutory Fields
          </div>
          <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
            {Object.entries(profile.mapped_fields).map(([std, orig]) => (
              <div key={std} className="flex items-center justify-between border border-border/60 bg-background/80 px-2 py-1">
                <span className="text-muted-foreground truncate">{std}:</span>
                <span className="text-emerald-400 font-semibold truncate ml-1">{orig}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.unmapped_fields.length > 0 && (
        <div className="text-[9px] text-muted-foreground">
          <span className="font-semibold text-muted-foreground/80">Extended Attributes: </span>
          <span>{profile.unmapped_fields.join(', ')}</span>
        </div>
      )}
    </div>
  );
}
