import { useEffect, useState } from 'react';
import { 
  Search, 
  Plus, 
  Phone,
  Mail,
  MapPin,
  Package,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockPICs, mockNPSSurveys } from '@/data/mockData';
import { getClients, type ClientDto } from '@/lib/api';

export function ClientsModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getClients()
      .then((response) => {
        if (active) setClients(response.data);
      })
      .catch(() => {
        if (active) setClients([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  
  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500">Gestión de clientes y contactos</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{clients.length}</p>
            <p className="text-sm text-slate-500">Total Clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {clients.filter(c => c.status.toLowerCase() === 'active').length}
            </p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{mockPICs.length}</p>
            <p className="text-sm text-slate-500">PICs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">8.4</p>
            <p className="text-sm text-slate-500">NPS Promedio</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar cliente por nombre o código..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="pics">PICs</TabsTrigger>
          <TabsTrigger value="nps">NPS</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
            {!loading && filteredClients.length === 0 && (
              <p className="text-sm text-slate-500 col-span-full">No se encontraron clientes.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockPICs.map((pic) => (
              <PICCard key={pic.id} pic={pic} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="nps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Encuestas NPS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockNPSSurveys.map((survey) => (
                <div key={survey.id} className="flex items-start justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-slate-900">{survey.osiCode}</p>
                      <Badge variant={
                        survey.category === 'promoter' ? 'default' :
                        survey.category === 'passive' ? 'secondary' :
                        'destructive'
                      }>
                        {survey.category === 'promoter' ? 'Promotor' :
                         survey.category === 'passive' ? 'Pasivo' : 'Detractor'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{survey.clientName}</p>
                    {survey.comment && (
                      <p className="text-sm text-slate-500 mt-2">"{survey.comment}"</p>
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                      survey.score >= 9 ? 'bg-green-500' :
                      survey.score >= 7 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}>
                      {survey.score}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClientCard({ client }: { client: ClientDto }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {client.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">{client.name}</h4>
              <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                {client.status === 'active' ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{client.code}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3" />
                <span className="truncate">{client.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                <span>{client.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{client.address}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1 text-sm">
                <Package className="h-4 w-4 text-slate-400" />
                <span>{client.totalServices} servicios</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <span>{client.type}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PICCard({ pic }: { pic: typeof mockPICs[0] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-green-100 text-green-700">
              {pic.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">{pic.name}</h4>
              {pic.isPrimary && <Badge variant="default">Principal</Badge>}
            </div>
            <p className="text-sm text-slate-500">{pic.role}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3" />
                <span className="truncate">{pic.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                <span>{pic.phone}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
