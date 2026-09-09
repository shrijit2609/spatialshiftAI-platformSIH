'use client';

import { Calendar, History, ArrowRight, Eye, GitCompare } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

interface TimelineSliderProps {
  activeEpoch: number;
  onEpochChange: (epoch: number) => void;
  baselineName?: string;
  surveyName?: string;
  changesCount?: number;
}

export function TimelineSlider({
  activeEpoch,
  onEpochChange,
  baselineName = 'Baseline Survey (T0)',
  surveyName = 'Drone Resurvey (T1)',
  changesCount = 0,
}: TimelineSliderProps) {
  return (
    <div className="border border-border bg-card/90 backdrop-blur-md p-2.5 text-xs shadow-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <GitCompare className="h-3.5 w-3.5 text-amber-400" />
          <span>Multi-Epoch Change Timeline</span>
        </div>
        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-300">
          {changesCount} Variations Detected
        </Badge>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span className={activeEpoch === 0 ? 'text-primary font-bold' : ''}>{baselineName}</span>
        <span className={activeEpoch === 1 ? 'text-emerald-400 font-bold' : ''}>{surveyName}</span>
      </div>

      <Slider
        value={[activeEpoch]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={(val) => onEpochChange(val[0])}
        className="w-full"
      />

      <div className="flex items-center justify-between text-[9px] text-muted-foreground/70">
        <span>0.0 (Legacy Registry)</span>
        <span>Blend: {(activeEpoch * 100).toFixed(0)}%</span>
        <span>1.0 (Harmonized Cadastre)</span>
      </div>
    </div>
  );
}
