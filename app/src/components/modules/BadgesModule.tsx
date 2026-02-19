import { useState } from 'react';
import { 
  Award, 
  Trophy,
  Star,
  TrendingUp,
  Recycle,
  Zap,
  Package,
  Truck,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/formatters';
import { mockBadges, mockUsers } from '@/data/mockData';
import { toast } from 'sonner';

export function BadgesModule() {
  const [showNewBadgeDialog, setShowNewBadgeDialog] = useState(false);

  // Estadísticas del módulo ecológico
  const ecoStats = {
    boxesReused: 45,
    woodSaved: 1250, // kg
    co2Reduced: 890, // kg
    treesPlanted: 12,
  };

  const handleCreateBadge = () => {
    toast.success('Nueva insignia creada');
    setShowNewBadgeDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo Ecológico</h1>
          <p className="text-slate-500">Insignias y sostenibilidad</p>
        </div>
        <Button onClick={() => setShowNewBadgeDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Insignia
        </Button>
      </div>

      {/* Stats Ecológicos */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-green-800">
            <Recycle className="h-5 w-5" />
            Impacto Ambiental
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-white rounded-lg">
              <Recycle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-900">{ecoStats.boxesReused}</p>
              <p className="text-sm text-slate-500">Cajas Reutilizadas</p>
            </div>
            <div className="text-center p-4 bg-white rounded-lg">
              <Package className="h-8 w-8 text-amber-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-900">{ecoStats.woodSaved}</p>
              <p className="text-sm text-slate-500">kg Madera Ahorrada</p>
            </div>
            <div className="text-center p-4 bg-white rounded-lg">
              <TrendingUp className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-900">{ecoStats.co2Reduced}</p>
              <p className="text-sm text-slate-500">kg CO₂ Evitado</p>
            </div>
            <div className="text-center p-4 bg-white rounded-lg">
              <Award className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-900">{ecoStats.treesPlanted}</p>
              <p className="text-sm text-slate-500">Árboles Plantados</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats de Insignias */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockBadges.length}</p>
            <p className="text-sm text-slate-500">Total Insignias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">156</p>
            <p className="text-sm text-slate-500">Otorgadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">42</p>
            <p className="text-sm text-slate-500">Empleados con Insignias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">8,450</p>
            <p className="text-sm text-slate-500">Puntos Entregados</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="badges">
        <TabsList>
          <TabsTrigger value="badges">Insignias</TabsTrigger>
          <TabsTrigger value="leaderboard">Ranking</TabsTrigger>
          <TabsTrigger value="eco">Reportes Eco</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockBadges.map((badge) => (
              <BadgeAdminCard key={badge.id} badge={badge} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Top Empleados - Puntos Acumulados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockUsers
                  .sort((a, b) => b.points - a.points)
                  .slice(0, 5)
                  .map((user, index) => (
                    <div key={user.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-slate-200 text-slate-700' :
                        index === 2 ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.department}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">{user.points}</p>
                        <p className="text-xs text-slate-500">puntos</p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eco">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reutilización de Cajas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">Meta mensual</span>
                      <span className="font-medium">45 / 60</span>
                    </div>
                    <Progress value={75} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-600">75%</p>
                      <p className="text-xs text-slate-500">Meta alcanzada</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-600">{formatCurrency(2250)}</p>
                      <p className="text-xs text-slate-500">Ahorro generado</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reducción de CO₂</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">Este mes</span>
                      <span className="font-medium">890 kg</span>
                    </div>
                    <Progress value={65} className="h-2" />
                  </div>
                  <p className="text-sm text-slate-600">
                    Equivalente a <strong>45 árboles</strong> absorbiendo CO₂ durante un día.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Nueva Insignia */}
      <Dialog open={showNewBadgeDialog} onOpenChange={setShowNewBadgeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crear Nueva Insignia
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input placeholder="Ej: Maestro del Reciclaje" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input placeholder="Describe el logro..." />
            </div>
            <div>
              <Label>Requisito</Label>
              <Input placeholder="Ej: Reutilizar 20 cajas" />
            </div>
            <div>
              <Label>Puntos</Label>
              <Input type="number" defaultValue={50} />
            </div>
            <div>
              <Label>Color</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option value="yellow">Amarillo (Oro)</option>
                <option value="green">Verde (Eco)</option>
                <option value="blue">Azul (Profesional)</option>
                <option value="red">Rojo (Urgente)</option>
                <option value="purple">Púrpura (Especial)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBadgeDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateBadge}>Crear Insignia</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BadgeAdminCard({ badge }: { badge: typeof mockBadges[0] }) {
  const iconMap: Record<string, React.ElementType> = {
    Zap,
    Package,
    Truck,
    Star,
    Recycle,
  };

  const Icon = iconMap[badge.icon] || Award;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-lg flex items-center justify-center`} style={{ backgroundColor: badge.color + '20' }}>
            <Icon className="h-7 w-7" style={{ color: badge.color }} />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-900">{badge.name}</h4>
            <p className="text-sm text-slate-500">{badge.description}</p>
            <p className="text-xs text-slate-400 mt-1">{badge.requirement}</p>
          </div>
          <div className="text-right">
            <Badge variant="secondary">+{badge.points} pts</Badge>
            <div className="flex gap-1 mt-2">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
