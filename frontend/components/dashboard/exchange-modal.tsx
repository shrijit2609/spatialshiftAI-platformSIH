'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Database, Download, FileCode, Landmark, Layers, MapPin, Network, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { getExchangeCatalog, getExchangeAuditLogs, getApiBaseUrl, type ExchangeCatalog, type AuditLogEntry } from '@/lib/api';

interface ExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExchangeModal({ open, onOpenChange }: ExchangeModalProps) {
  const [catalog, setCatalog] = useState<ExchangeCatalog | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryBbox, setQueryBbox] = useState('');
  const [queryResult, setQueryResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([getExchangeCatalog(), getExchangeAuditLogs()])
        .then(([cat, logs]) => {
          setCatalog(cat);
          setAuditLogs(logs.audit_trail);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleTestQuery = async () => {
    try {
      const url = `${getApiBaseUrl()}/api/exchange/query${queryBbox ? `?bbox=${queryBbox}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      setQueryResult(JSON.stringify(json, null, 2));
    } catch (e) {
      setQueryResult('Failed to query exchange API');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto border-border bg-card/95 backdrop-blur-xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-bold text-base">
            <Network className="h-5 w-5" />
            <DialogTitle>Inter-Departmental Spatial Data Exchange Protocol</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Standardized OGC/WFS-compliant data sharing across Revenue, Survey, Town Planning, and Utility boards.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="catalog" className="mt-4">
          <TabsList className="grid grid-cols-3 bg-muted/60 p-1">
            <TabsTrigger value="catalog" className="gap-2 text-xs">
              <Layers className="h-3.5 w-3.5" />
              <span>Departmental Layer Catalog</span>
            </TabsTrigger>
            <TabsTrigger value="query" className="gap-2 text-xs">
              <Terminal className="h-3.5 w-3.5" />
              <span>WFS / REST Query API</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Exchange Audit Trail</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border/80 bg-background/50 p-3 rounded-none">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1">
                  <Landmark className="h-4 w-4 text-sky-400" />
                  <span>Revenue & RoR Directorate</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Synchronized land tenure, khasra mutation logs, and khata records.</p>
              </div>
              <div className="border border-border/80 bg-background/50 p-3 rounded-none">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1">
                  <Building2 className="h-4 w-4 text-amber-400" />
                  <span>Town Planning & Municipal Corp</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Building extrusions, zoning boundaries, and municipal asset corridors.</p>
              </div>
            </div>

            <div className="border border-border bg-card/40 p-4">
              <h4 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">Active Pool Datasets</h4>
              {catalog?.active_layers.length ? (
                <div className="space-y-2">
                  {catalog.active_layers.map((layer) => (
                    <div key={layer.dataset_id} className="flex items-center justify-between border border-border/60 bg-background/80 p-2.5 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{layer.layer_name}</span>
                          <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                            {layer.department_category}
                          </Badge>
                          {layer.is_harmonized && (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 text-[9px]">
                              Harmonized Fabric
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {layer.feature_count} features • CRS: {layer.crs}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`${getApiBaseUrl()}${layer.endpoints.geojson}`}
                          download
                          className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] hover:border-primary text-sky-300"
                        >
                          <Download className="h-3 w-3" />
                          <span>GeoJSON</span>
                        </a>
                        <a
                          href={`${getApiBaseUrl()}${layer.endpoints.csv}`}
                          download
                          className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] hover:border-primary text-emerald-300"
                        >
                          <Download className="h-3 w-3" />
                          <span>CSV</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No datasets currently loaded into the exchange pool. Ingest or harmonize a dataset first.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="query" className="space-y-4 pt-4">
            <div className="border border-border bg-card/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Live WFS / REST Query Console</span>
                <span className="text-[10px] font-mono text-muted-foreground">GET /api/exchange/query</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Optional BBOX filter: min_lon,min_lat,max_lon,max_lat (e.g. 73.85,18.51,73.86,18.53)"
                  value={queryBbox}
                  onChange={(e) => setQueryBbox(e.target.value)}
                  className="flex-1 bg-background border border-border px-3 py-1.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                />
                <Button size="sm" onClick={handleTestQuery} className="gap-1 text-xs">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Execute Query</span>
                </Button>
              </div>

              <div className="border border-border/80 bg-black/90 p-3 text-[11px] font-mono text-emerald-400 max-h-48 overflow-y-auto scrollbar-thin">
                <p className="text-muted-foreground text-[10px] mb-1"># Curl Example:</p>
                <p className="text-amber-300 text-[10px] select-all mb-2">
                  curl -X GET &quot;{getApiBaseUrl()}/api/exchange/query{queryBbox ? `?bbox=${queryBbox}` : ''}&quot; -H &quot;Accept: application/geo+json&quot;
                </p>
                {queryResult ? (
                  <pre className="whitespace-pre-wrap">{queryResult}</pre>
                ) : (
                  <span className="text-muted-foreground/60">Click &quot;Execute Query&quot; to test the live inter-departmental JSON stream.</span>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4 pt-4">
            <div className="border border-border bg-card/40 p-4">
              <h4 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">Cryptographic Inter-Agency Audit Trail</h4>
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="border border-border/60 bg-background/80 p-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-sky-300 font-semibold">{log.department}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="text-amber-400 font-bold">{log.action}</span>
                      <span className="text-muted-foreground">• {log.feature_count} features transferred</span>
                      <Badge variant="outline" className="text-[8px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        {log.status}
                      </Badge>
                    </div>
                    <p className="text-[9px] text-muted-foreground/70 truncate mt-1">
                      Receipt: {log.receipt_hash}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
