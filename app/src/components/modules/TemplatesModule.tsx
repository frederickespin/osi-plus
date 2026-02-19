import { useState } from 'react';
import { 
  Search, 
  Plus, 
  Copy, 
  Edit, 
  Package, 
  Users, 
  MessageSquare,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ptfs, pets, pics, pgds } from '@/data/mockData';
import type { PTF, PET, PETRole, PIC, PGD, PGDDocument } from '@/types/osi.types';

function safeText(value: unknown, fallback = '-') {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function shortText(value: unknown, max = 100, fallback = 'Sin contenido') {
  const text = safeText(value, fallback);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function toArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}

export function TemplatesModule() {
  const [activeTab, setActiveTab] = useState('ptf');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPTF, setSelectedPTF] = useState<PTF | null>(null);
  const [selectedPET, setSelectedPET] = useState<PET | null>(null);
  const [selectedPIC, setSelectedPIC] = useState<PIC | null>(null);
  const [selectedPGD, setSelectedPGD] = useState<PGD | null>(null);

  const filteredPTFs = ptfs.filter(p => 
    safeText(p.name, '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredPETs = pets.filter(p => 
    safeText(p.name, '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredPICs = pics.filter(p => 
    safeText(p.name, '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredPGDs = pgds.filter(p => 
    safeText(p.name, '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plantillas</h1>
          <p className="text-slate-500">PTF, PET, PIC y PGD - Motores de automatización</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Plantilla
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="ptf" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            PTF
          </TabsTrigger>
          <TabsTrigger value="pet" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            PET
          </TabsTrigger>
          <TabsTrigger value="pic" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            PIC
          </TabsTrigger>
          <TabsTrigger value="pgd" className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            PGD
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar plantillas..." 
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* PTF Tab */}
        <TabsContent value="ptf" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPTFs.map((ptf) => (
              <Card 
                key={ptf.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedPTF(ptf)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Package className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2">{safeText(ptf.name, 'Plantilla sin nombre')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">{safeText(ptf.description, 'Sin descripción')}</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Tipo de Servicio:</span>
                      <Badge variant="outline">{safeText(ptf.serviceType, 'General')}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Materiales:</span>
                      <span className="font-medium">{toArray(ptf.materials).length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Herramientas:</span>
                      <span className="font-medium">{toArray(ptf.tools).length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PET Tab */}
        <TabsContent value="pet" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPETs.map((pet) => (
              <Card 
                key={pet.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedPET(pet)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-purple-600" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2">{safeText(pet.name, 'Plantilla sin nombre')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">{safeText(pet.description, 'Sin descripción')}</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Configuración de Roles:</p>
                      <div className="flex flex-wrap gap-2">
                        {toArray<PETRole>(pet.roles as PETRole[]).map((role, idx) => (
                          <Badge key={idx} variant="secondary">
                            {role.quantity}x {safeText(role.role, 'Rol')}
                            {toArray(role.shab).length > 0 && ` (${toArray(role.shab).join(', ')})`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">Requisitos:</span> {toArray(pet.requirements).join(', ') || 'Sin requisitos'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PIC Tab */}
        <TabsContent value="pic" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPICs.map((pic) => (
              <Card 
                key={pic.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedPIC(pic)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2">{safeText(pic.name, 'Plantilla sin nombre')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Tipo de Servicio:</span>
                      <Badge variant="outline">{safeText(pic.serviceType, 'General')}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Contenido:</p>
                      <p className="text-sm bg-slate-50 p-3 rounded">
                        {shortText(pic.content, 100)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Template WhatsApp:</p>
                      <p className="text-sm bg-green-50 p-3 rounded text-green-800">
                        {shortText(pic.whatsappTemplate, 100)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PGD Tab */}
        <TabsContent value="pgd" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPGDs.map((pgd) => (
              <Card 
                key={pgd.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedPGD(pgd)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <ClipboardCheck className="w-6 h-6 text-orange-600" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2">{safeText(pgd.name, 'Plantilla sin nombre')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Tipo de Servicio:</span>
                      <Badge variant="outline">{safeText(pgd.serviceType, 'General')}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Documentos Requeridos:</p>
                      <div className="space-y-2">
                        {toArray<PGDDocument>(pgd.documents as PGDDocument[]).map((doc, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                            <div className="flex items-center gap-2">
                              {doc.required ? (
                                <AlertCircle className="w-4 h-4 text-red-500" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-slate-400" />
                              )}
                              <span className="text-sm">{doc.name}</span>
                            </div>
                            <div className="flex gap-1">
                              {doc.clientVisible && (
                                <Badge variant="outline" className="text-xs">Cliente</Badge>
                              )}
                              {doc.officeManaged && (
                                <Badge variant="secondary" className="text-xs">Oficina</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* PTF Detail Dialog */}
      <Dialog open={!!selectedPTF} onOpenChange={() => setSelectedPTF(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {safeText(selectedPTF?.name, 'Plantilla sin nombre')}
            </DialogTitle>
          </DialogHeader>
          {selectedPTF && (
            <div className="space-y-6">
              <p className="text-slate-600">{safeText(selectedPTF.description, 'Sin descripción')}</p>
              
              <div>
                <h4 className="font-medium mb-3">Materiales</h4>
                <div className="space-y-2">
                  {toArray(selectedPTF.materials).map((mat, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-400" />
                        <span>Material {mat.materialId}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-500">Cantidad: {mat.quantity}</span>
                        {mat.optional && (
                          <Badge variant="outline">Opcional</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Herramientas</h4>
                <div className="flex flex-wrap gap-2">
                  {toArray(selectedPTF.tools).map((tool, idx) => (
                    <Badge key={idx} variant="secondary">
                      {tool.quantity}x {tool.toolId}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="pt-4 border-t flex gap-2">
                <Button className="flex-1">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar Plantilla
                </Button>
                <Button variant="outline">
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PET Detail Dialog */}
      <Dialog open={!!selectedPET} onOpenChange={() => setSelectedPET(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {safeText(selectedPET?.name, 'Plantilla sin nombre')}
            </DialogTitle>
          </DialogHeader>
          {selectedPET && (
            <div className="space-y-6">
              <p className="text-slate-600">{safeText(selectedPET.description, 'Sin descripción')}</p>
              
              <div>
                <h4 className="font-medium mb-3">Configuración de Equipo</h4>
                <div className="space-y-3">
                  {toArray(selectedPET.roles).map((role, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge>{role.role}</Badge>
                          <span className="font-medium">{role.quantity} persona(s)</span>
                        </div>
                      </div>
                      {toArray(role.shab).length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-sm text-slate-500">Habilidades:</span>
                          {toArray(role.shab).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {role.minRating && (
                        <div className="mt-1 text-sm text-slate-500">
                          Calificación mínima: {role.minRating}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Requisitos Adicionales</h4>
                <ul className="list-disc list-inside text-sm text-slate-600">
                  {toArray(selectedPET.requirements).map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PIC Detail Dialog */}
      <Dialog open={!!selectedPIC} onOpenChange={() => setSelectedPIC(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {safeText(selectedPIC?.name, 'Plantilla sin nombre')}
            </DialogTitle>
          </DialogHeader>
          {selectedPIC && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Tipo de Servicio:</span>
                <Badge>{safeText(selectedPIC.serviceType, 'General')}</Badge>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Contenido</h4>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{safeText(selectedPIC.content, 'Sin contenido configurado')}</p>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Template WhatsApp</h4>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-800 whitespace-pre-wrap">
                    {safeText(selectedPIC.whatsappTemplate, 'Sin template de WhatsApp')}
                  </p>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Las variables {'{{cliente}}'}, {'{{fecha}}'}, {'{{supervisor}}'}, {'{{codigo}}'} serán reemplazadas automáticamente.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PGD Detail Dialog */}
      <Dialog open={!!selectedPGD} onOpenChange={() => setSelectedPGD(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              {safeText(selectedPGD?.name, 'Plantilla sin nombre')}
            </DialogTitle>
          </DialogHeader>
          {selectedPGD && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Tipo de Servicio:</span>
                <Badge>{safeText(selectedPGD.serviceType, 'General')}</Badge>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Checklist de Documentos</h4>
                <div className="space-y-2">
                  {toArray(selectedPGD.documents).map((doc, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {doc.required ? (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-slate-400" />
                          )}
                          <span className="font-medium">{doc.name}</span>
                        </div>
                        <div className="flex gap-2">
                          {doc.required && (
                            <Badge variant="destructive">Obligatorio</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {doc.clientVisible && (
                          <Badge variant="outline" className="text-xs">
                            Visible para Cliente
                          </Badge>
                        )}
                        {doc.officeManaged && (
                          <Badge variant="secondary" className="text-xs">
                            Gestión Interna
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-800">
                  <span className="font-medium">Regla de Bloqueo:</span> El sistema impedirá 
                  cerrar el Proyecto si no se han marcado como "Recibido Físicamente" los 
                  documentos críticos definidos en esta plantilla ("Paso de la Muerte").
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
