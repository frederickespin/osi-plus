import { useState } from 'react';
import { 
  Plus, 
  ChevronLeft,
  ChevronRight,
  Clock,
  Wrench,
  Package,
  Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockCalendarEvents } from '@/data/mockData';

export function CalendarModule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const getEventsForDay = (day: number) => {
    return mockCalendarEvents.filter(event => {
      const eventDate = new Date(event.startDate);
      return eventDate.getDate() === day && eventDate.getMonth() === currentDate.getMonth();
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
          <p className="text-slate-500">Programación de servicios y eventos</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[150px] text-center">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button className="ml-4">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Evento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayNames.map(day => (
          <div key={day} className="text-center font-semibold text-slate-500 py-2">
            {day}
          </div>
        ))}
        
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="h-24" />
        ))}
        
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const events = getEventsForDay(day);
          const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth();
          
          return (
            <div 
              key={day} 
              className={`h-24 border border-slate-200 rounded-lg p-2 ${isToday ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'}`}
            >
              <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
                {day}
              </div>
              <div className="space-y-1">
                {events.slice(0, 2).map((event, idx) => (
                  <div 
                    key={idx}
                    className={`text-xs px-1.5 py-0.5 rounded truncate ${
                      event.type === 'osi' ? 'bg-blue-100 text-blue-700' :
                      event.type === 'maintenance' ? 'bg-orange-100 text-orange-700' :
                      event.type === 'meeting' ? 'bg-purple-100 text-purple-700' :
                      'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {event.title}
                  </div>
                ))}
                {events.length > 2 && (
                  <div className="text-xs text-slate-500">+{events.length - 2} más</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Próximos Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockCalendarEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    event.type === 'osi' ? 'bg-blue-100' :
                    event.type === 'maintenance' ? 'bg-orange-100' :
                    event.type === 'meeting' ? 'bg-purple-100' :
                    'bg-slate-100'
                  }`}>
                    {event.type === 'osi' && <Package className="h-5 w-5 text-blue-600" />}
                    {event.type === 'maintenance' && <Wrench className="h-5 w-5 text-orange-600" />}
                    {event.type === 'meeting' && <Users className="h-5 w-5 text-purple-600" />}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{event.title}</p>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(event.startDate).toLocaleDateString()} {new Date(event.startDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant={event.status === 'scheduled' ? 'outline' : 'default'}>
                  {event.status === 'scheduled' ? 'Programado' : 'Completado'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
