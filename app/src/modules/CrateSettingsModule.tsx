// src/components/modules/CrateSettingsModule.tsx
import { useMemo, useState } from "react";
import { Save, RotateCcw, Settings } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  loadCrateSettings,
  resetCrateSettings,
  saveCrateSettings,
  type CrateSettings,
  type CrateProfileKey,
} from "@/lib/crateSettingsStore";

function setByPath<T>(obj: T, path: Array<string | number>, value: unknown): T {
  const clone = structuredClone(obj) as any;
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return clone as T;
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const PROFILE_LABEL: Record<CrateProfileKey, string> = {
  STANDARD_LOCAL: "Caja estándar (local)",
  EXPORT_ISPM15: "Caja exportación ISPM-15",
  PREMIUM_ART_IT: "Caja premium (Arte/IT)",
  MACHINERY_ISPM15: "Caja maquinaria (ISPM-15)",
};

export default function CrateSettingsModule({ embedded }: { embedded?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState("materials");
  const [settings, setSettings] = useState<CrateSettings>(() => loadCrateSettings());

  const profiles = useMemo(() => Object.keys(settings.engineering.plywoodThicknessByProfileIn) as CrateProfileKey[], [settings]);

  const onSave = () => {
    try {
      const saved = saveCrateSettings(settings, "A"); // si luego tienes auth, pon userId real
      setSettings(saved);
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error guardando configuración");
    }
  };

  const onReset = () => {
    const def = resetCrateSettings("A");
    setSettings(def);
    toast.success("Configuración restaurada a valores por defecto");
  };

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuración - Cajas de Madera
            </h1>
            <p className="text-slate-500">
              Umbrales, nesting, ingeniería, redondeos y cargos adicionales.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Versión: {settings.meta.versionId} · {new Date(settings.meta.updatedAt).toLocaleString()}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar
            </Button>
            <Button onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Guardar
            </Button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="materials">Materiales</TabsTrigger>
          <TabsTrigger value="nesting">Nesting</TabsTrigger>
          <TabsTrigger value="protection">Protección</TabsTrigger>
          <TabsTrigger value="engineering">Ingeniería</TabsTrigger>
          <TabsTrigger value="pricing">Precios</TabsTrigger>
          <TabsTrigger value="adders">Adicionales</TabsTrigger>
        </TabsList>

        {/* A) Materials */}
        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Catálogo de materiales</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Largo estándar listones (pulgadas)</Label>
                <Input
                  type="number"
                  value={settings.materials.lumber.lengthsIn[0]}
                  onChange={(e) => setSettings(s => setByPath(s, ["materials","lumber","lengthsIn",0], num(e.target.value)))}
                />
                <p className="text-xs text-slate-500">Ej: 192 = 16 pies</p>
              </div>

              <div className="space-y-2">
                <Label>Planchas 4x8 (pulgadas)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={settings.materials.plywood.sheetSizeIn.w}
                    onChange={(e) => setSettings(s => setByPath(s, ["materials","plywood","sheetSizeIn","w"], num(e.target.value)))}
                    placeholder="Ancho"
                  />
                  <Input
                    type="number"
                    value={settings.materials.plywood.sheetSizeIn.h}
                    onChange={(e) => setSettings(s => setByPath(s, ["materials","plywood","sheetSizeIn","h"], num(e.target.value)))}
                    placeholder="Alto"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cartón (pulgadas)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.materials.cardboard.thicknessIn}
                  onChange={(e) => setSettings(s => setByPath(s, ["materials","cardboard","thicknessIn"], num(e.target.value)))}
                />
              </div>

              <div className="space-y-2">
                <Label>Opciones Plywood (pulgadas, CSV)</Label>
                <Input
                  value={settings.materials.plywood.thicknessOptionsIn.join(",")}
                  onChange={(e) => {
                    const vals = e.target.value.split(",").map(v => Number(v.trim())).filter(v => Number.isFinite(v) && v > 0);
                    setSettings(s => setByPath(s, ["materials","plywood","thicknessOptionsIn"], vals));
                  }}
                  placeholder="0.25,0.375,0.5"
                />
              </div>

              <div className="space-y-2">
                <Label>Opciones Foam (pulgadas, CSV)</Label>
                <Input
                  value={settings.materials.foam.thicknessOptionsIn.join(",")}
                  onChange={(e) => {
                    const vals = e.target.value.split(",").map(v => Number(v.trim())).filter(v => Number.isFinite(v) && v > 0);
                    setSettings(s => setByPath(s, ["materials","foam","thicknessOptionsIn"], vals));
                  }}
                  placeholder="0.75,1,1.5"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* B) Nesting */}
        <TabsContent value="nesting" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Parámetros de nesting</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Profundidad máxima para agrupar (cm)</Label>
                <Input
                  type="number"
                  value={settings.nesting.maxDepthForNestingCm}
                  onChange={(e) => setSettings(s => setByPath(s, ["nesting","maxDepthForNestingCm"], num(e.target.value)))}
                />
              </div>

              <div className="space-y-2">
                <Label>Máx. artículos por caja</Label>
                <Input
                  type="number"
                  value={settings.nesting.maxItemsPerBox}
                  onChange={(e) => setSettings(s => setByPath(s, ["nesting","maxItemsPerBox"], Math.max(1, Math.floor(num(e.target.value)))))}
                />
              </div>

              <div className="space-y-2">
                <Label>Tolerancia similitud (%)</Label>
                <Input
                  type="number"
                  value={settings.nesting.similarityTolerancePct}
                  onChange={(e) => setSettings(s => setByPath(s, ["nesting","similarityTolerancePct"], num(e.target.value)))}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Rotación 90° por defecto</p>
                  <p className="text-sm text-slate-500">Permite agrupar si intercambia Alto/Ancho</p>
                </div>
                <Switch
                  checked={settings.nesting.allowRotationDefault}
                  onCheckedChange={(v) => setSettings(s => setByPath(s, ["nesting","allowRotationDefault"], v))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* C) Protection */}
        <TabsContent value="protection" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Protección por fragilidad (1..5)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fragilidad</TableHead>
                    <TableHead>Foam perímetro (in)</TableHead>
                    <TableHead>Foam entre items (in)</TableHead>
                    <TableHead>Cartón (in)</TableHead>
                    <TableHead>Doble perímetro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.protectionByFragility.map((row, idx) => (
                    <TableRow key={row.fragility}>
                      <TableCell className="font-medium">{row.fragility}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.perimeterFoamIn}
                          onChange={(e) => setSettings(s => setByPath(s, ["protectionByFragility", idx, "perimeterFoamIn"], num(e.target.value)))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.betweenItemsFoamIn}
                          onChange={(e) => setSettings(s => setByPath(s, ["protectionByFragility", idx, "betweenItemsFoamIn"], num(e.target.value)))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.cardboardIn}
                          onChange={(e) => setSettings(s => setByPath(s, ["protectionByFragility", idx, "cardboardIn"], num(e.target.value)))}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.doublePerimeter}
                          onCheckedChange={(v) => setSettings(s => setByPath(s, ["protectionByFragility", idx, "doublePerimeter"], v))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* D) Engineering */}
        <TabsContent value="engineering" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Umbrales de ingeniería</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                ["use2x4IfWeightLbAbove", "Usar 2x4 si peso > (lb)"],
                ["use2x4IfLongestSideInAbove", "Usar 2x4 si lado mayor > (in)"],
                ["skidIfWeightLbAbove", "Skid si peso > (lb)"],
                ["skidIfLongestSideInAbove", "Skid si lado mayor > (in)"],
                ["addRibsIfLongestSideInAbove", "Costillas si lado mayor > (in)"],
                ["addXBracingIfAspectRatioAbove", "X si aspect ratio >"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(settings.engineering.thresholds as any)[key]}
                    onChange={(e) => setSettings(s => setByPath(s, ["engineering","thresholds", key], num(e.target.value)))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Espesor plywood por perfil</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles.map((p) => (
                <div key={p} className="space-y-2">
                  <Label>{PROFILE_LABEL[p]} (in)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={settings.engineering.plywoodThicknessByProfileIn[p]}
                    onChange={(e) => setSettings(s => setByPath(s, ["engineering","plywoodThicknessByProfileIn", p], num(e.target.value)))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* E) Pricing */}
        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Redondeos y desperdicio</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Redondeo materiales (step)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={settings.pricing.rounding.stepUnits}
                  onChange={(e) => setSettings(s => setByPath(s, ["pricing","rounding","stepUnits"], num(e.target.value)))}
                />
                <p className="text-xs text-slate-500">Ej: 0.5 (regla del medio material)</p>
              </div>

              <div className="space-y-2">
                <Label>Desperdicio plywood</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.pricing.wastePctByMaterial.plywood}
                  onChange={(e) => setSettings(s => setByPath(s, ["pricing","wastePctByMaterial","plywood"], num(e.target.value)))}
                />
              </div>

              <div className="space-y-2">
                <Label>Desperdicio lumber</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.pricing.wastePctByMaterial.lumber}
                  onChange={(e) => setSettings(s => setByPath(s, ["pricing","wastePctByMaterial","lumber"], num(e.target.value)))}
                />
              </div>

              <div className="space-y-2">
                <Label>Desperdicio foam</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.pricing.wastePctByMaterial.foam}
                  onChange={(e) => setSettings(s => setByPath(s, ["pricing","wastePctByMaterial","foam"], num(e.target.value)))}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg md:col-span-2">
                <div>
                  <p className="font-medium text-slate-900">Mano de obra</p>
                  <p className="text-sm text-slate-500">Activa si deseas estimar horas y costo</p>
                </div>
                <Switch
                  checked={settings.pricing.labor.enabled}
                  onCheckedChange={(v) => setSettings(s => setByPath(s, ["pricing","labor","enabled"], v))}
                />
              </div>

              {settings.pricing.labor.enabled && (
                <div className="space-y-2">
                  <Label>Tarifa mano de obra / hora (RD$)</Label>
                  <Input
                    type="number"
                    value={settings.pricing.labor.ratePerHour}
                    onChange={(e) => setSettings(s => setByPath(s, ["pricing","labor","ratePerHour"], num(e.target.value)))}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Markup por perfil</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles.map((p) => (
                <div key={p} className="space-y-2">
                  <Label>{PROFILE_LABEL[p]} (0.25 = 25%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={settings.pricing.markupPctByProfile[p]}
                    onChange={(e) => setSettings(s => setByPath(s, ["pricing","markupPctByProfile", p], num(e.target.value)))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Costos unitarios (RD$)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Listón 1x4 (16')</Label>
                  <Input
                    type="number"
                    value={settings.pricing.unitCosts.lumberPerStick["1x4"]}
                    onChange={(e) => setSettings((s) => setByPath(s, ["pricing", "unitCosts", "lumberPerStick", "1x4"], num(e.target.value)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Listón 2x4 (16')</Label>
                  <Input
                    type="number"
                    value={settings.pricing.unitCosts.lumberPerStick["2x4"]}
                    onChange={(e) => setSettings((s) => setByPath(s, ["pricing", "unitCosts", "lumberPerStick", "2x4"], num(e.target.value)))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {settings.materials.plywood.thicknessOptionsIn.map((t) => {
                  const key = String(t);
                  return (
                    <div key={key} className="space-y-2">
                      <Label>Plywood {key}" (por plancha 4x8)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.unitCosts.plywoodPerSheetByThicknessIn[key] ?? 0}
                        onChange={(e) => setSettings((s) => setByPath(s, ["pricing", "unitCosts", "plywoodPerSheetByThicknessIn", key], num(e.target.value)))}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {settings.materials.foam.thicknessOptionsIn.map((t) => {
                  const key = String(t);
                  return (
                    <div key={key} className="space-y-2">
                      <Label>Foam {key}" (por plancha 4x8)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.unitCosts.foamPerSheetByThicknessIn[key] ?? 0}
                        onChange={(e) => setSettings((s) => setByPath(s, ["pricing", "unitCosts", "foamPerSheetByThicknessIn", key], num(e.target.value)))}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label>Cartón 1/4" (por plancha 4x8)</Label>
                <Input
                  type="number"
                  value={settings.pricing.unitCosts.cardboardPerSheet}
                  onChange={(e) => setSettings((s) => setByPath(s, ["pricing", "unitCosts", "cardboardPerSheet"], num(e.target.value)))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* F) Adders */}
        <TabsContent value="adders" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Fumigación / ISPM-15 / IPPC</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Habilitar fumigación / ISPM-15</p>
                  <p className="text-sm text-slate-500">Exportación y maquinaria típicamente lo requieren</p>
                </div>
                <Switch
                  checked={settings.adders.fumigation.enabled}
                  onCheckedChange={(v) => setSettings(s => setByPath(s, ["adders","fumigation","enabled"], v))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Modo (FIXED / PER_M3 / PER_BOX)</Label>
                  <Input
                    value={settings.adders.fumigation.mode}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fumigation","mode"], e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tarifa fumigación (RD$)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fumigation.rate}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fumigation","rate"], num(e.target.value)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Marcaje IPPC (RD$ por caja)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fumigation.markingIppcRatePerBox}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fumigation","markingIppcRatePerBox"], num(e.target.value)))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Tornillos / Clavos / Consumibles</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Habilitar (fasteners)</p>
                  <p className="text-sm text-slate-500">Cobro automático por caja o por plancha</p>
                </div>
                <Switch
                  checked={settings.adders.fasteners.enabled}
                  onCheckedChange={(v) => setSettings(s => setByPath(s, ["adders","fasteners","enabled"], v))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Modo (FIXED_PER_BOX / PER_SHEET)</Label>
                  <Input
                    value={settings.adders.fasteners.mode}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fasteners","mode"], e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Small max (in³)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fasteners.boxVolumeThresholdsIn3.smallMax}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fasteners","boxVolumeThresholdsIn3","smallMax"], num(e.target.value)))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Medium max (in³)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fasteners.boxVolumeThresholdsIn3.mediumMax}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fasteners","boxVolumeThresholdsIn3","mediumMax"], num(e.target.value)))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>RD$ Small (por caja)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fasteners.rateBySize.small}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fasteners","rateBySize","small"], num(e.target.value)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RD$ Medium (por caja)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fasteners.rateBySize.medium}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fasteners","rateBySize","medium"], num(e.target.value)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RD$ Large (por caja)</Label>
                  <Input
                    type="number"
                    value={settings.adders.fasteners.rateBySize.large}
                    onChange={(e) => setSettings(s => setByPath(s, ["adders","fasteners","rateBySize","large"], num(e.target.value)))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
